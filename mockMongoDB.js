// Using UMD pattern: https://github.com/umdjs/umd
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory); // Support AMD
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(); // Support NodeJS
    } else {
        root.causality = factory(); // Support browser global
    }
}(this, function () {
	function createDatabase() {
		// Neat logging
		let objectlog = require('./objectlog.js');
		// let log = objectlog.log;
		// let log = objectlog.log;
		function log() {}
		let logGroup = objectlog.group;
		let logUngroup = objectlog.groupEnd;

		/*-----------------------------------------------
		 *       Emulated mongo-DB:ish database
		 *-----------------------------------------------*/

		let dataRecords = [];
		
		function getAllRecordsParsed() {
			let parsedRecords = [];
			dataRecords.forEach(function(record) {
				parsedRecords.push(JSON.parse(record));
			});
			return parsedRecords;
		}
		
		let deallocatedIds = [];
		
		function deallocate(id) {
			// throw new Error("should not deallocate: " + id);
			dataRecords[id] = "[deallocated]";
			deallocatedIds.push(id);
		}
		
		function isDeallocated(id) {
			return dataRecords[id] === "[deallocated]";
		}
		
		function saveNewRecord(dataRecord) {
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

		function updateRecord(id, contents) {
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
		
		function updateRecordPath(id, path, value) {
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
		
		function deleteRecordPath(id, path, value) {
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
		
		function getRecord(id) {
			// console.log(dataRecords[id])
			return JSON.parse(dataRecords[id]);
		}		
		
		function deleteRecord(id) {
			dataRecords[id] = null; // Do not delete it as we want to keep nextId = records.length.
		}	
		
		function getRecordsCount() {
			return dataRecords.length;
		}
		
		function clearDatabase() {
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
	
	let databases = {};
	
	return function(databaseName) {
		if (typeof(databases[databaseName]) === 'undefined') {
			databases[databaseName] = createDatabase();
		}
		return databases[databaseName];
	}
}));

