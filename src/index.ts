// pt-xref index.ts

// import * as s3files from './s3';

const util = require('util');
const fs = require('fs');
// const mysql = require('mysql2/promise');

const ONE_DAY = 24 * 60 * 60 * 1000;

// execute on time interval
// var interval = setInterval(() => { go(); }, ONE_DAY);
// console.log('started');

go();

// remember last log file read, don't read again
// open logs directory
// for each log
//  open file
//  get unique patient/encounter
//  get unique users
//  get user role changes
//  get navigation
//  get survey
//  get sessions


async function go() {
    try {


        console.log('done');
        process.exit();
    } catch (error) {
        console.log(error);
        console.log('end');
        process.exit();
    }
}
