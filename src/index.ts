// pt-xref index.ts

import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import * as config from './config.json';
import * as db from './mysql-connector';
// import * as s3files from './s3';

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
    variableContentThree?: string
    variableContentFour?: string
    variableContentFive?: string
    variableContentSix?: string
}


interface Admission { patientId: string, hospitalId: string, encounterId: string, noLongerEligible: string };
interface User { user: string, patientId: string, encounterId: string, hospitalId: string, eulaAcceptedDate: string, createdDate: string, currentRole: string, invitedDate: string, invitedBy: string, noLongerEligible: string, removedDate: string, removedBy: string };
interface UserRole { user: string, changedTo: string, changedDate: string, changedBy: string };
interface Navigation { user: string, toPage: string, arrivedTime: string, departedTime: string, duration: number, depth: number, device: string };
interface Session { user: string, device: string, sessionStart: string, lastNavigation: string, duration: number, depth: number };
interface Survey { user: string, responseTime: string, question?: string, response?: string, responseIndex?: number[], comment?: string };

interface FileNames { admission: string, user: string, userRole: string, session: string, navigation: string, survey: string };

// enum entryType {
//     CEAHTTP = 'CEA-HTTP',

// };



let dateForFileName: string = '';

db.init().then(() => {
    // execute on time interval
    // var interval = setInterval(() => { go(); }, ONE_DAY);
    // console.log('started');
    go();
});


// TODO remember last log file read, don't read again

// const isFile = (fileName: fs.PathLike) => {
//     return fs.lstatSync(fileName).isFile();
// };


// async function go() {
async function go() {
    try {
        // create the output directory if doesn't exist
        fs.mkdirSync(config.analyticsPath, { recursive: true });

        let fileNames = getFileNames();

        // admissions & users from the app database
        // get admissions
        const admissions = await getAdmissions();
        writeAdmissions(admissions, fileNames.admission);
        // get users
        const users = await getUsers();
        writeUsers(users, fileNames.user);

        // nav, sessions, userRoles, surveys from the logs
        let dataObj: LogRow[] | undefined;
        // read logs directory
        const logs = fs.readdirSync(config.logsPath).map((logFile: fs.PathLike) => {
            return path.join(config.logsPath, logFile.toString());
        })
            .filter((file: string) => {
                // only the .logs
                return (path.extname(file).toLowerCase() === '.log');
            })
            // const logsData = logs
            .map(async (log: any) => {
                console.log('log', log)
                dataObj = getLogData(log);
                if (dataObj && dataObj.length > 0) {
                    // writeAdmissions(getAdmissions(dataObj), fileNames.admission);
                    // writeUsers(getUsers(dataObj), fileNames.user);
                    writeUserRoles(getUserRoles(dataObj), fileNames.userRole);
                    const navAndSsn = getNavigation(dataObj);
                    // console.log(util.inspect(navAndSsn));
                    writeNavigations(navAndSsn.navigations, fileNames.navigation);
                    writeSessions(navAndSsn.sessions, fileNames.session);
                    // getNavigation(dataObj);  // also gets sessions
                    writeSurveys(getSurveys(dataObj), fileNames.survey);
                }
            });

        console.log('done');
        process.exit();
    } catch (error) {
        console.log(error);
        console.log('end');
        process.exit();
    }
}



function getLogData(log: string): LogRow[] | undefined {
    // convert the log's data to an object array
    // DEBUG
    // ignore all but the ones that have surveys
    // if (
    //     log === '/home/stan/F/Projects/EHCServer/logs/test/combined20210914184002-2.log' // ||
    //     // log === '/home/stan/F/Projects/EHCServer/logs/test/combined20210914184002.log' // ||
    //     // log === '/home/stan/F/Projects/EHCServer/logs/test/combined20210914180002.log' ||
    //     // log === '/home/stan/F/Projects/EHCServer/logs/test/combined20210915213001.log' ||
    //     // log === '/home/stan/F/Projects/EHCServer/logs/test/combined20210805-0812.log'
    //     ) {
    // END DEBUG
    // console.log('getLogData', log);
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
                        variableContentThree: (rowArray.length > 11) ? rowArray[11] : undefined,
                        variableContentFour: (rowArray.length > 12) ? rowArray[12] : undefined,
                        variableContentFive: (rowArray.length > 13) ? rowArray[13] : undefined,
                        variableContentSix: (rowArray.length > 14) ? rowArray[14] : undefined,
                    }
                });
        // TODO: ALSO FILTER OUT ANY ROW TYPES NOT NEEDED
        // console.log('dataObj', util.inspect(dataObj));
        return dataObj;
    } catch (error) {
        console.log(error);
    }
    // }
}


// db version
async function getAdmissions(): Promise<Admission[]> {
    // a new patient will be a proxy or patient signup
    // since no one else can invite
    // could look at invites too, to future proof?
    let admissions: Admission[] = []
    console.log('admissions')
    const adms = await db.executeQuery('SELECT * FROM encounter', {});
    // console.log('adms', util.inspect(adms, true, 9, false));
    adms.map((a: any) => {
        admissions.push({
            patientId: a.emr_patient_id,
            hospitalId: a.hospital_id,
            encounterId: a.emr_encounter_id,
            noLongerEligible: formatDate(new Date(a.expired_date))
        });
    });
    return admissions;
}

// db version
async function getUsers(): Promise<User[]> {
    let users: User[] = [];
    console.log('users')
    const query = "SELECT u.comm_identifier, e.emr_patient_id, e.emr_encounter_id, e.hospital_id, u.created, ue.role, e.expired_date" +
        " FROM EHCCEA.user u" +
        " JOIN EHCCEA.user_encounter ue on ue.user_id = u.user_id" +
        " JOIN EHCCEA.encounter e on e.encounter_id = ue.encounter_id"
    const usrs = await db.executeQuery(query, {});
    // console.log('usrs', util.inspect(usrs, true, 9, false));
    usrs.map((u: any) => {
        const createdDate = formatDate(new Date(u.created));
        users.push({
            user: u.comm_identifier,
            patientId: u.emr_patient_id,
            encounterId: u.emr_encounter_id,
            hospitalId: u.hospital_id,
            eulaAcceptedDate: createdDate,
            createdDate: createdDate,
            currentRole: u.role,
            invitedDate: (u.role.toUpperCase() === 'PATIENT' || u.role.toUpperCase() === 'PROXY') ? createdDate : '',
            invitedBy: (u.role.toUpperCase() === 'PATIENT' || u.role.toUpperCase() === 'PROXY') ? 'Self' : '',
            noLongerEligible: formatDate(new Date(u.expired_date)),
            removedDate: '',
            removedBy: ''
        });
    });
    return users;
}


// source logs layout
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
// l variableContentThree?: string  (elapsed on http rows)
// m variableContentFour?: string  
// n variableContentFive?: string  
// o variableContentSix?: string 


function parseOtherObject(toBeParsed?: string): Object {
    var parsed: { [k: string]: any } = {};
    if (!!toBeParsed) {
        let a = toBeParsed.split(',');
        // console.log('a', a);
        a.map((item: string) => {
            let b = item.split(':');
            // console.log('b', b);
            parsed[b[0].trim()] = b[1].trim().replace(/( |”|“)/g, '');
            // odd kinds of double quotes, and an extra space .trim() didn't get
            //      these characters were cut-and-pasted from console display of original log values
        })
    }
    // console.log('parsed', parsed);
    return parsed;
}

// for parsing stuff from the call body
// .filter((entry: LogRow) => {
//     const callBody = entry.variableContentTwo;
//     return callBody?.includes('resource:USER');
// })
// .filter((entry: LogRow) => {
//     const callBody = entry.variableContentTwo;
//     // return (callBody?.includes('ROLE') || callBody?.includes('CREATE'));
//     return (callBody?.includes('CREATE'));
// })
function parseCallBody(body?: string): Object {
    var parsed: { [k: string]: any } = {};
    if (!!body) {
        console.log('body', body);
        const x = body.substring(body.indexOf('{'));
        parsed = (x) ? JSON.parse(x) : {};
    }
    console.log('parsed', parsed);
    return parsed;
}

function getUserRoles(logs?: LogRow[]): UserRole[] {
    let userRoles: UserRole[] = [];
    if (!!logs) {
        // let userRoles: { user: string, changedTo: string, changedDate: string, changedBy: string }[] = [];
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
            const y: any = parseCallBody(entry.variableContentTwo);
            // const x = (entry.variableContentTwo) ?
            //     entry.variableContentTwo.substring(entry.variableContentTwo.indexOf('{'))
            //     : undefined
            // const y = (x) ? JSON.parse(x) : undefined;
            // console.log('object', util.inspect(y))
            userRoles.push({
                user: y.commIdentifier,  // which one is the user being changed, and which the user doing the changing?
                changedTo: y.role,
                // user: y.commIdentifier,  // which one is the user being changed, and which the user doing the changing?
                // changedTo: y.userRole,
                changedDate: entry.timestamp,
                changedBy: entry.user
            })
        });
        if (userRoles.length > 0) console.log('userRoles', userRoles);
    }
    return userRoles;
}

function getNavigation(logs?: LogRow[]): { navigations: Navigation[], sessions: Session[] } {
    // console.log('logs', util.inspect(logs));
    let navigations: Navigation[] = [];
    let sessions: Session[] = [];
    if (!!logs) {
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
                a2.device.localeCompare(b2.device) ||
                a2.arrivedTime.localeCompare(b2.arrivedTime));
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
        // let sessions: Session[] = [];
        // get the first and last time values for each user
        // already sorted by user
        let session: Session;
        const TIMEOUT_DURATION = 60 * 5;  // 5 minutes
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
                        session.depth = (session.depth >= entry.depth) ? session.depth : entry.depth;
                        session.lastNavigation = entry.arrivedTime;
                        session.duration = duration(session.sessionStart, session.lastNavigation);
                        // save it
                        // console.log('saving at end of user', session);
                        let copy = { ...session };
                        sessions.push(copy);
                        // initialize for next user
                        session.user = navs[index + 1].user;
                        session.sessionStart = navs[index + 1].arrivedTime;
                        session.duration = 0;
                        session.lastNavigation = '';
                        session.depth = 0;
                        // console.log('starting for', navs[index + 1].user, session);
                    } else {
                        // same user (or first entry for next user)
                        session.user = entry.user;
                        session.device = entry.device;
                        session.lastNavigation = entry.departedTime;
                        session.depth = (session.depth >= entry.depth) ? session.depth : entry.depth;
                        const testDuration = duration(entry.arrivedTime, entry.departedTime);
                        // console.log('duration', testDuration, 'timeout', TIMEOUT_DURATION, (Number(session.duration) > TIMEOUT_DURATION))
                        if (testDuration > TIMEOUT_DURATION) {
                            // end the current session, 
                            // reset lastNavigation to previous & set duration 
                            session.lastNavigation = navs[index - 1].departedTime;
                            session.duration = (!!navs[index - 1].departedTime) ? duration(session.sessionStart, session.lastNavigation) : 0;
                            // console.log('saving at timeout', session);
                            let copy = { ...session };
                            sessions.push(copy);
                            // start a new one
                            // initialize for next user/span  (next row might be a new user)
                            session.user = navs[index + 1].user;
                            session.sessionStart = navs[index + 1].arrivedTime;
                            session.duration = 0;
                            session.lastNavigation = '';
                            session.depth = 0;
                            // console.log('starting after timeout', navs[index + 1].user, session);
                        } // else console.log('setting for same', session);
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

        // TODO investigate logs w 0 sessions

    }
    if (navigations.length > 0) console.log('navigations', navigations.length);
    if (sessions.length > 0) console.log('sessions', sessions.length);
    return { navigations: navigations, sessions: sessions };
}

function getSurveys(logs?: LogRow[]): Survey[] {
    let surveys: Survey[] = [];
    if (!!logs) {
        const srvys = logs.filter((entry: LogRow) => {
            return entry.entryType === 'SURVEY-RESPONSE';
        })
            .map((entry: LogRow) => {
                // might be a single value, might be an array
                // eg question:"What features were most helpful to stay informed about the patient?" answerNumber:"0,1,2"
                let responseIndex: number[] = [];
                if (entry.variableContentFour) {
                    if (entry.variableContentFour.includes(',')) {
                        responseIndex = entry.variableContentFour?.substring(entry.variableContentFour.indexOf(':"') + 2).slice(0, -1).split(',').map(a => +a);
                    } else {  // just one value
                        responseIndex.push(parseInt(entry.variableContentFour?.substring(entry.variableContentFour.indexOf(':"') + 2).slice(0, -1)));
                        if (isNaN(responseIndex[responseIndex.length - 1])) responseIndex[responseIndex.length - 1] = 0;
                    }
                }
                const survey: Survey = {
                    user: entry.user,
                    responseTime: entry.timestamp,
                    question: entry.variableContentThree?.substring(entry.variableContentThree.indexOf(':"') + 2).slice(0, -1).replace(/"/g, ''),
                    response: (entry.variableContentFive)
                        ? entry.variableContentFive.substring(entry.variableContentFive.indexOf(':"') + 2).slice(0, -1).replace(/"/g, '').replace(/undefined/g, '')
                        : '',
                    responseIndex: responseIndex,
                    comment: (entry.variableContentSix)
                        ? entry.variableContentSix.substring(entry.variableContentSix.indexOf(':"') + 2).slice(0, -1).replace(/"/g, '').replace(/null|undefined/g, '')
                        : ''
                }
                const copy = { ...survey };
                surveys.push(copy);
            });
    }
    return surveys;
}

// interface Admission { patientId: string, hospitalId: string, encounterId: string };
function writeAdmissions(admissions: Admission[], fileName: string) {
    if (admissions.length > 0) {
        // console.log('writing', fileName);
        const fd = fs.openSync(fileName, 'a');
        admissions.map((s: Admission) => {
            if (!excludePatient(s.patientId)) {
                let dataRow: string =
                    s.patientId + config.delimiter
                    + s.hospitalId + config.delimiter
                    + s.encounterId + config.delimiter
                    + s.noLongerEligible + config.delimiter
                    + '\n';
                fs.writeSync(fd, dataRow);
            }
        });
        fs.closeSync(fd);
    }
}
// interface User { user: string, patientId: string, encounterId: string, hospitalId: string, eulaAcceptedDate: string, 
//      createdDate: string, currentRole: string, invitedDate: string, invitedBy: string, removedDate: string, removedBy: string };
function writeUsers(users: User[], fileName: string) {
    if (users.length > 0) {
        // console.log('writing', fileName);
        const fd = fs.openSync(fileName, 'a');
        users.map((s: User) => {
            if (!excludePatient(s.patientId)) {
                let dataRow: string =
                    s.user + config.delimiter
                    + s.patientId + config.delimiter
                    + s.encounterId + config.delimiter
                    + s.hospitalId + config.delimiter
                    + s.eulaAcceptedDate + config.delimiter
                    + s.createdDate + config.delimiter
                    + s.currentRole + config.delimiter
                    + s.invitedDate + config.delimiter
                    + s.invitedBy + config.delimiter
                    + s.noLongerEligible + config.delimiter
                    + s.removedDate + config.delimiter
                    + s.removedBy
                    + '\n';
                fs.writeSync(fd, dataRow);
            }
        });
        fs.closeSync(fd);
    }
}

// interface UserRole { user: string, changedTo: string, changedDate: string, changedBy: string };
function writeUserRoles(userRoles: UserRole[], fileName: string) {
    if (userRoles.length > 0) {
        // console.log('writing', fileName);
        const fd = fs.openSync(fileName, 'a');
        userRoles.map((s: UserRole) => {
            if (!excludeUser(s.user)) {
                let dataRow: string =
                    s.user + config.delimiter
                    + s.changedTo + config.delimiter
                    + s.changedDate + config.delimiter
                    + s.changedBy
                    + '\n';
                fs.writeSync(fd, dataRow);
            }
        });
        fs.closeSync(fd);
    }
}

// interface Navigation { user: string, toPage: string, arrivedTime: string, departedTime: string, duration: number, depth: number, device: string };
function writeNavigations(navigations: Navigation[], fileName: string) {
    if (navigations.length > 0) {
        // console.log('writing', fileName);
        const fd = fs.openSync(fileName, 'a');
        navigations.map((s: Navigation) => {
            if (!excludeUser(s.user)) {
                let dataRow: string =
                    s.user + config.delimiter
                    + s.toPage + config.delimiter
                    + s.arrivedTime + config.delimiter
                    + s.departedTime + config.delimiter
                    + s.duration + config.delimiter
                    + '\n';
                fs.writeSync(fd, dataRow);
            }
        });
        fs.closeSync(fd);
    }
}
// interface Session { user: string, device: string, sessionStart: string, lastNavigation: string, duration: number, depth: number };
function writeSessions(sessions: Session[], fileName: string) {
    if (sessions.length > 0) {
        // console.log('writing', fileName);
        const fd = fs.openSync(fileName, 'a');
        sessions.map((s: Session) => {
            if (!excludeUser(s.user)) {
                let dataRow: string =
                    s.user + config.delimiter
                    + s.device + config.delimiter
                    + s.sessionStart + config.delimiter
                    + s.lastNavigation + config.delimiter
                    + s.duration + config.delimiter
                    + s.depth
                    + '\n';
                fs.writeSync(fd, dataRow);
            }
        });
        fs.closeSync(fd);
    }
}
function writeSurveys(surveys: Survey[], fileName: string) {
    if (surveys.length > 0) {
        // console.log('writing', fileName);
        const fd = fs.openSync(fileName, 'a');
        surveys.map((s: Survey) => {
            if (!excludeUser(s.user)) {
                let dataRow: string =
                    s.user + config.delimiter
                    + s.responseTime + config.delimiter
                    + s.question + config.delimiter
                    + s.response + config.delimiter
                    + s.responseIndex?.join(',') + config.delimiter
                    + s.comment
                    + '\n';
                fs.writeSync(fd, dataRow);
            }
        });
        fs.closeSync(fd);
    }
}


function excludePatient(patientId: string): boolean {
    const excludes: string[] = ["5682446"]
    return excludes.some((x: string) => x === patientId);
}
function excludeUser(userId: string): boolean {
    const excludes: string[] = [
        "caregivertestpat@encompasshealth.com",
        "caregivertestproxy@encompasshealth.com",
        "ehcsurrogate@gmail.com",
        "eileen.thayer@encompasshealth.com",
    ];
    return excludes.some((x: string) => x === userId);
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

function getFileNames(): FileNames {
    // generate time element for file names
    let now = new Date();
    dateForFileName = now.getFullYear() +
        twoDigit((now.getMonth() + 1)) +
        twoDigit(now.getDate()) +
        twoDigit(now.getHours()) +
        twoDigit(now.getMinutes()) +
        twoDigit(now.getSeconds());
    console.log(dateForFileName);
    // set file names
    return {
        admission: config.analyticsPath + 'Admissions' + dateForFileName + '.txt',
        user: config.analyticsPath + 'User' + dateForFileName + '.txt',
        userRole: config.analyticsPath + 'UserRoleEvent' + dateForFileName + '.txt',
        session: config.analyticsPath + 'Session' + dateForFileName + '.txt',
        navigation: config.analyticsPath + 'Navigation' + dateForFileName + '.txt',
        survey: config.analyticsPath + 'Survey' + dateForFileName + '.txt',
    };
}

function formatDate(d: Date): string {
    return d.getFullYear()
        + '-' + twoDigit((d.getMonth() + 1))
        + '-' + twoDigit(d.getDate())
        + ' ' + twoDigit(d.getHours())
        + ':' + twoDigit(d.getMinutes())
        + ':' + twoDigit(d.getSeconds());
}

function twoDigit(x: number): string {
    return (x < 10 ? '0' : '') + x;
}

// version that looks at logs
// function getAdmissions(logs?: LogRow[]): Admission[] {
//     // a new patient will be a proxy or patient signup
//     // since no one else can invite
//     // could look at invites too, to future proof?
//     let admissions: Admission[] = []
//     console.log('admissions')
//     if (!!logs) {
//         const pts = logs.filter((entry: LogRow) => {
//             return entry.entryType === 'CLIENT-API-REQUEST';
//         })
//             .filter((entry: LogRow) => {
//                 const callBody = entry.variableContentTwo;
//                 return callBody?.includes('resource:PATIENT');
//             })
//             .filter((entry: LogRow) => {
//                 const callBody = entry.variableContentTwo;
//                 return (callBody?.includes('GET') || callBody?.includes('UPDATE') || callBody?.includes('REFRESH'));
//             })
//             .map((entry: LogRow) => {
//                 admissions.push({
//                     patientId: entry.patient,
//                     hospitalId: entry.hospital,
//                     encounterId: entry.patient   // NOTE don't actually have an encounterId yet
//                 });
//             })
//         if (pts.length > 0) console.log('patients', pts);
//         if (admissions.length > 0) console.log('patients', admissions);
//     }
//     return admissions;
// }

// alternate way to get patients, 
// get unique occurrances as with users
// NO, think i have to convert users to the patient method,
//  looking for only creates or updates or deletes

// interface User { user: string, patientId: string, encounterId: string, hospitalId: string, eulaAcceptedDate: string, 
// createdDate: string, currentRole: string, invitedDate: string, invitedBy: string, removedDate: string, removedBy: string };


// action:CREATE,resource:USER,data:{"commIdentifier":"3026502469","userPIN":"2468","userName":"Susan Kifer",
// "patientId":"10133293","userRole":"PATIENT","code":"582682"}


// version that uses logs
// function getUsers(logs?: LogRow[]): User[] {
//     // first get any CREATE USER
//     // then how to get invited users?
//     let users: User[] = [];
//     if (!!logs) {
//         const userIds: string[] = [];
//         // filters log entries to CREATE USER only
//         logs.filter((entry: LogRow) => {
//             return (entry.entryType === 'AUTH-RESPONSE'
//                 && entry.message === 'User added');
//         })
//             .map((entry: LogRow) => {
//                 if (!userIds.includes(entry.user)) {
//                     userIds.push(entry.user);
//                     console.log('entry', util.inspect(entry))
//                     const x: any = parseOtherObject(entry.variableContentOne);
//                     console.log('user', util.inspect(x));
//                     users.push({
//                         user: entry.user,
//                         patientId: entry.patient,
//                         encounterId: entry.patient, // don't actually have one
//                         hospitalId: entry.hospital,
//                         eulaAcceptedDate: entry.timestamp,
//                         createdDate: entry.timestamp,
//                         currentRole: x.userRole,
//                         invitedDate: (x.userRole?.toUpperCase() === 'PATIENT' || x.userRole?.toUpperCase() === 'PROXY') ? entry.timestamp : '',
//                         invitedBy: (x.userRole?.toUpperCase() === 'PATIENT' || x.userRole?.toUpperCase() === 'PROXY') ? 'Self' : '',
//                         removedDate: '',
//                         removedBy: ''
//                     });
//                     // TODO: update fields from db where not available in log
//                 }
//             })

//         if (userIds.length > 0) console.log('users', userIds);
//     }
//     return users;
// }
