
export function createDatabase() {
  // Neat logging
  // let objectlog = require('./objectlog.js');
  // let log = objectlog.log;
  // let logGroup = objectlog.group;
  // let logUngroup = objectlog.groupEnd;
  
  function log() {} 
  function logGroup() {}
  function logUngroup() {}

  /*-----------------------------------------------
   *       Emulated mongo-DB:ish database
   *-----------------------------------------------*/

  let dataRecords = [];
  
  function getAllRecordsParsed() {
    let parsedRecords = [];
    dataRecords.forEach(function(record) {
      if (record === deallocatedTag) {
        parsedRecords.push(deallocatedTag);
      } else {
        parsedRecords.push(JSON.parse(record));         
      }
    });
    return parsedRecords;
  }
  
  let deallocatedIds = [];
  let deallocatedTag = "[deallocated]"
  async function deallocate(id) {
    // throw new Error("should not deallocate: " + id);
    dataRecords[id] = deallocatedTag;
    deallocatedIds.push(id);
  }
  
  async function isDeallocated(id) {
    return dataRecords[id] === deallocatedTag;
  }
  
  async function saveNewRecord(dataRecord) {
    log("saveNewRecord:");
    logGroup();
    let id = (deallocatedIds.length === 0) ? dataRecords.length : deallocatedIds.shift();
    // dataRecord.id = "_id_" + id + "_di_"; // debug
    
    let copy = { id : "_id_" + id + "_di_" };
    Object.assign(copy, dataRecord);
    dataRecord = copy;
    
    // console.log("saveNewRecord");
    log(dataRecord);
    dataRecords[id] = JSON.stringify(dataRecord); // Will this work for normal..?
    log(dataRecords, 3);
    logUngroup();
    return id;        
  }

  async function updateRecord(id, contents) {
    log("updateRecord: " + id);
    logGroup();
    log(contents)
    if (typeof(dataRecords[id]) === "undefined") {
      throw new Error("Trying to update nonexistent data record.");
    }
    // contents.id = "_id_" + id + "_di_";

    let copy = { id : "_id_" + id + "_di_" };
    Object.assign(copy, contents);
    contents = copy;

    // console.log("updateRecord");
    dataRecords[id] = JSON.stringify(contents);
    log(dataRecords, 3);
    logUngroup();
    return id;
  }
  
  async function updateRecordPath(id, path, value) {
    // log("updateRecordPath: {id:" + id + "}." + path.join(".") + " = " + value);
    let record = getRecord(id);
    let property = path[path.length - 1];
    let index = 0;
    let target = record;
    while(index < path.length - 1) {
      target = target[path[index]];
      index++;
    }
    target[property] = value;
    dataRecords[id] = JSON.stringify(record);
  }
  
  async function deleteRecordPath(id, path) {
    // log("updateRecordPath: {id:" + id + "}." + path.join(".") + " = " + value);
    let record = getRecord(id);
    let property = path[path.length - 1];
    let index = 0;
    let target = record;
    while(index < path.length - 1) {
      target = target[path[index]];
      index++;
    }
    delete target[property];
    dataRecords[id] = JSON.stringify(record);
  }
  
  async function getRecord(id) {
    if (await isDeallocated(id)) {
      throw new Error("Cannot request a deleted record! id:" + id);
    } else if (typeof(dataRecords[id]) === 'undefined') {
      throw new Error("Cannot find any record for id '" + id + "'");
    } else {        
      return JSON.parse(dataRecords[id]);
    }
  }   
  
  async function deleteRecord(id) {
    dataRecords[id] = null; // Do not delete it as we want to keep nextId = records.length.
  } 
  
  async function getRecordsCount() {
    log(dataRecords.length)
    return dataRecords.length;
  }
  
  async function clearDatabase() {
    dataRecords.length = 0;
  }
  
  return {
    saveNewRecord : saveNewRecord,
    updateRecord : updateRecord,
    updateRecordPath : updateRecordPath,
    deleteRecordPath : deleteRecordPath,
    getRecord : getRecord,
    deleteRecord : deleteRecord,
    getAllRecordsParsed : getAllRecordsParsed,
    getRecordsCount : getRecordsCount,
    clearDatabase : clearDatabase,
    deallocate : deallocate,
    isDeallocated : isDeallocated
  };    
}
  
const databases = {};

export default function getDatabase(databaseName) {
  if (typeof(databases[databaseName]) === 'undefined') {
    databases[databaseName] = createDatabase();
  }
  return databases[databaseName];
}

