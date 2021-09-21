import * as config from './config.json';
const mysql = require('mysql2/promise');

const poolOptions = {
    connectionLimit: 40,
    waitForConnections: true,
    queueLimit: 0,  // 150  - 0=unlimited?
    connectTimeout: 10000,
    host: '',
    port: 3306,
    user: '',
    password: '',
    database: '',
    ssl: "Amazon RDS"  //?
};
// user: 'ehcappuser',
// password: 'ehcappuser',
// database: 'EHCCEAUser'
// user: 'ehcapptest',
// password: 'ehcapptest',
// database: 'EHCCEATest'

let pool: any;

export async function init() {
    console.log('database', config.database.host, config.database.schema);
    poolOptions.host = config.database.host;
    poolOptions.port = config.database.port;
    poolOptions.user = config.database.user;
    poolOptions.password = config.database.pwd;
    poolOptions.database = config.database.schema;
    pool = mysql.createPool(poolOptions);
    pool.on('connection', function (connection: any) {
        console.log('new connection', connection.threadId);
        // generic error listener for connection errors, or if .query does not use callback(err), etc
        connection.on('error', function (err: any) {
            console.error('db error ', err.code);
            // connection.destroy();  // maybe not necessary, should try by itself?
        })
    });
    pool.on('enqueue', function () {
        console.log('Waiting for available connection');
    });
}

export async function executeQuery(query: string, parms: any) {
    try {
        const result = await pool.query(query, parms);
        return result[0];
    } catch (error) {
        console.error('executeQuery error', error);
        console.error('query', query);
        console.error('parms', parms);
        if (!!error.index) throw (error);
        throw new Error(error.sqlMessage);
    }
}

// implementation notes
// if using "regular" select query, 
//     [
//         TextRow {
//             encounter_id: 34,
//             emr_encounter_id: null,
//             patient_name: 'ZZTEST, DEHCCEA',
//             emr_patient_id: '9399840',
//             birth_date: '1952-04-10',
//         }
//     ]

// if using insert/update/delete query, results returned as 
//  unlabeled result stats
//      {
//         fieldCount: 0,
//         affectedRows: 0,
//         insertId: 0,
//         info: '',
//         serverStatus: 2,
//         warningStatus: 0
//     }

// if using stored procedures, returns results like this:
// unlabeled array, with [0]= array of TextRow {}, and stats in [1]=ResultSetHeader
// [
//     [
//         TextRow {
//             encounter_id: 34,
//             emr_encounter_id: null,
//             patient_name: 'ZZTEST, DEHCCEA',
//             emr_patient_id: '9399840',
//             birth_date: '1952-04-10',
//         }
//     ],
//     ResultSetHeader {
//         fieldCount: 0,
//         affectedRows: 0,
//         insertId: 0,
//         info: '',
//         serverStatus: 2,
//         warningStatus: 0
//     }
// ]
