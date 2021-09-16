// pt-xref index.ts

import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import * as config from './config.json';

const ONE_DAY = 24 * 60 * 60 * 1000;

interface LogRow {
    timestamp: string,
    requestId: string,
    component: string,
    version: string,
    entryType: string,
    user: string,
    patient: string,
    hospital: string,
    message: string,
    variableContentOne?: string,
    variableContentTwo?: string,
    elapsed?: string
}

interface Navigation { user: string, toPage: string, arrivedTime: string, departedTime: string, duration: number, depth: number, device: string };
interface Session { user: string, device: string, sessionStart: string, lastNavigation: string, duration: number, depth: number };

// enum entryType {
//     CEAHTTP = 'CEA-HTTP',

// };

// execute on time interval
// var interval = setInterval(() => { go(); }, ONE_DAY);
// console.log('started');

go();

// remember last log file read, don't read again

const isFile = (fileName: fs.PathLike) => {
    return fs.lstatSync(fileName).isFile();
};


// async function go() {
function go() {
    try {
        // create the output directory?  

        let dataObj: LogRow[] | undefined;
        // read logs directory
        const logs = fs.readdirSync(config.logsPath).map((logFile: fs.PathLike) => {
            return path.join(config.logsPath, logFile.toString());
        })
            .filter((file: string) => {
                // only the .logs
                return (path.extname(file).toLowerCase() === '.log');
            })
            // console.log('logs', logs)
            // const logsData = logs
            .map((log: any) => {
                dataObj = getLogData(log);
                // console.log('first entry', dataObj ? dataObj[0] : undefined);
                // getAdmissions(dataObj);
                // getUsers(dataObj);
                // getUserRoles(dataObj);
                getNavigation(dataObj);  // also gets sessions
            });
        // console.log('logsData', util.inspect(logsData));
        //    //  get survey
        // }

        console.log('done');// get admissions
        process.exit();
    } catch (error) {
        console.log(error);
        console.log('end');
        process.exit();
    }
}

function getLogData(log: string): LogRow[] | undefined {
    // convert the log's data to an object array
    console.log('getLogData', log);
    try {
        const buffer = fs.readFileSync(log);
        const dataObj: LogRow[] =
            buffer.toString()
                .split('\n')
                .map((row: string) => {
                    const rowArray = row.split('^');
                    return {
                        timestamp: rowArray[0],
                        requestId: rowArray[1],
                        component: rowArray[2],
                        version: rowArray[3],
                        entryType: rowArray[4],
                        user: rowArray[5],
                        patient: rowArray[6],
                        hospital: rowArray[7],
                        message: rowArray[8],
                        variableContentOne: (rowArray.length > 9) ? rowArray[9] : undefined,
                        variableContentTwo: (rowArray.length > 10) ? rowArray[10] : undefined,
                        elapsed: (rowArray.length > 11) ? rowArray[11] : undefined,
                    }
                });
        // TODO: ALSO FILTER OUT ANY ROW TYPES NOT NEEDED
        // console.log('dataObj', util.inspect(dataObj));
        return dataObj;
    } catch (error) {
        console.log(error);
    }
}

// a timestamp: string,
// b requestId: string,
// c component: string,
// d version: string,
// e entryType: string,
// f user: string,
// g patient: string,
// h hospital: string,
// i message: string,
// j variableContentOne?: string,
// k variableContentTwo?: string,
// l elapsed?: string

function getAdmissions(logs?: LogRow[]) {
    // console.log('logs', util.inspect(logs));
    if (!!logs) {
        const patients = logs.filter((entry: LogRow) => {
            return entry.entryType === 'CLIENT-API-REQUEST';
        })
            .filter((entry: LogRow) => {
                const callBody = entry.variableContentTwo;
                return callBody?.includes('resource:PATIENT');
            })
            .filter((entry: LogRow) => {
                const callBody = entry.variableContentTwo;
                return (callBody?.includes('GET') || callBody?.includes('UPDATE') || callBody?.includes('REFRESH'));
            })
        // TODO write these patients
        console.log('patients', patients);
    }
}

function getUsers(logs?: LogRow[]) {
    if (!!logs) {
        const users: string[] = [];
        logs.filter((entry: LogRow) => {
            return entry.entryType === 'CLIENT-API-REQUEST';
        })
            .map((entry: LogRow) => {
                if (!users.includes(entry.user)) users.push(entry.user);
            })

        // .filter((entry: LogRow) => {
        //     const callBody = entry.variableContentTwo;
        //     return callBody?.includes('resource:USER');
        // })
        // .filter((entry: LogRow) => {
        //     const callBody = entry.variableContentTwo;
        //     return (callBody?.includes('ROLE') || callBody?.includes('CREATE'));
        // })
        // TODO also get created date, removed date, invited date, eula accepted, current role
        console.log('users', users);
    }
}

function getUserRoles(logs?: LogRow[]) {
    if (!!logs) {
        let userRoles: { user: string, changedTo: string, changedDate: string, changedBy: string }[] = [];
        const ur = logs.filter((entry: LogRow) => {
            return entry.entryType === 'CLIENT-API-REQUEST';
        })
            .filter((entry: LogRow) => {
                const callBody = entry.variableContentTwo;
                return callBody?.includes('resource:USER');
            })
            .filter((entry: LogRow) => {
                const callBody = entry.variableContentTwo;
                return (callBody?.includes('ROLE'));
                // return (callBody?.includes('ROLE') || callBody?.includes('CREATE'));
            })
        ur.map((entry: LogRow) => {
            console.log('raw', entry.variableContentTwo)
            const x = (entry.variableContentTwo) ?
                entry.variableContentTwo.substring(entry.variableContentTwo.indexOf('{'))
                : undefined
            const y = (x) ? JSON.parse(x) : undefined;
            console.log('object', util.inspect(y))
            userRoles.push({
                user: y.commIdentifier,  // which one is the user being changed, and which the user doing the changing?
                changedTo: y.userRole,
                changedDate: entry.timestamp,
                changedBy: entry.user
            })
        });
        // TODO, write these changes
        console.log('userRoles', userRoles);
    }
}

function getNavigation(logs?: LogRow[]) {
    // console.log('logs', util.inspect(logs));
    if (!!logs) {
        let navigations: Navigation[] = [];
        const nav = logs.filter((entry: LogRow) => {
            return entry.entryType === 'CLIENT-NAV';
        })
        nav.map((entry: LogRow) => {
            const toPage = parsePage(entry.variableContentOne);
            let navigation: Navigation = {
                user: entry.user,
                toPage: toPage.page,
                arrivedTime: entry.timestamp,
                departedTime: '',
                duration: 0,
                depth: toPage.depth,
                device: entry.message
            };
            navigations.push(navigation);
        })
        navigations.sort((a, b) => {  // device within user
            const a2 = a as unknown as Navigation;
            const b2 = b as unknown as Navigation;
            return (a2.user.localeCompare(b2.user) ||
                a2.device.localeCompare(b2.device));
            // TODO add time here too, time within device within user
        })
            .map((entry: Navigation, index, navs) => {
                // no values for last item for given user
                if (index !== (navs.length - 1)) {
                    if (entry.user === navs[index + 1].user) {
                        entry.departedTime = navs[index + 1].arrivedTime;
                        entry.duration = duration(entry.arrivedTime, entry.departedTime);
                    }
                }
            });
        let sessions: Session[] = [];
        // get the first and last time values for each user
        // already sorted by user
        let session: Session;
        navigations.map((entry: Navigation, index, navs) => {
            if (index === 0) {
                session = {
                    user: entry.user,
                    device: entry.device,
                    sessionStart: entry.arrivedTime,
                    lastNavigation: entry.departedTime,
                    duration: 0,
                    depth: 0
                };
                // console.log('first', session);
            } else {
                if (index !== navs.length - 1) { // not the last one
                    // console.log('not last')
                    if (entry.user !== navs[index + 1].user) {
                        // this is the last entry for the current user
                        // get the "end" fields
                        session.lastNavigation = entry.arrivedTime;
                        session.duration = duration(session.sessionStart, session.lastNavigation);
                        session.depth = (session.depth >= entry.depth) ? session.depth : entry.depth;
                        // save it
                        // console.log('saving at end of user', session);
                        let copy = {...session};
                        sessions.push(copy);
                        // initialize for next user
                        session.user = navs[index + 1].user;
                        session.sessionStart = navs[index + 1].arrivedTime;
                        // console.log('starting for', navs[index + 1].user, session);
                    } else {
                        // same user (or first entry for next user)
                        session.user = entry.user;
                        session.device = entry.device;
                        session.lastNavigation = entry.departedTime;
                        session.duration = 0;
                        session.depth = (session.depth >= entry.depth) ? session.depth : entry.depth;
                        // console.log('setting for same', session);
                    };
                } else {  // is the last one
                    session.lastNavigation = entry.arrivedTime;
                    session.duration = duration(session.sessionStart, session.lastNavigation);
                    session.depth = (session.depth >= entry.depth) ? session.depth : entry.depth;
                    let copy = { ...session };
                    sessions.push(copy);
                    // console.log('saving last', session);
                }
            }

        })

        // TODO handle case, if span between is > 5 min, it's a new session


        // TODO write navigations
        // (ignore .depth)
        // console.log('navigations', navigations);
        // TODO write sessions
        // console.log('sessions', sessions);
    }
}

function parsePage(url?: string): { page: string, depth: number } {
    let final = { page: '', depth: 0 };
    if (!!url) {
        let parts = url.split('/').splice(4);
        // console.log('url', url, 'length', parts.length)
        // console.log(parts);
        const parms = parts[parts.length - 1].split('?');
        // console.log(parms);

        let page: string = '';
        // specific parms for some pages
        if (parms.length > 0) {
            switch (parms[0].toLowerCase()) {
                case '':
                    page = 'splash'
                    break;
                case 'dashboard':
                case 'verification':
                case 'create-password':
                case 'send-code':
                case 'patient-form':
                case 'license':
                case 'invite-code':
                case 'invited-patient-form':
                    page = parms[0].toLowerCase();
                    break;
                case 'login':
                    if (parms.length > 1) {
                        if (parms[1].includes('register')) page = 'register';
                    } else {
                        page = parms[0].toLowerCase(); // ie, 'login'
                    }
                    break;
                default:
                    // "standard" page
                    page = parms[parms.length - 1].toLowerCase();
                    // if (page.includes('pages')) console.log('url', url);
                    // remove 'goalName' if present
                    // eg "://localhost/#/goals/goal-category/Mobility?goalName=Walk%20150%20Feet"
                    page = page.replace(/goalname=/g, '');

                    // special case for some pages
                    // eg "://myehccaregiver.com/#/discharge/resources/materials/Patient%20Summary/XR-3036105856"
                    if (parts.includes('materials')) page = parts[parts.length - 2].toLowerCase();  // removes specific document id
                    // eg "://myehccaregiver.com/#/invite/user-profile/7325338866"
                    if (parts.includes('invite')) page = 'invite';  // removes invited user id
            }
        } else page = 'splash'; // should never be?
        page = page.replace(/%20/g, ' ');
        // console.log('page', page)

        final.page = page;
        if (page !== 'splash') final.depth = parts.length;
    }
    return final;
}

function duration(start: Date | string, end: Date | string): number {
    const startAt = (util.types.isDate(start)) ? start : new Date(start);
    const endAt = (util.types.isDate(end)) ? end : new Date(end);
    return (endAt.valueOf() - startAt.valueOf()) / 1000;
}