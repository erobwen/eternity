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
		let log = objectlog.log;
		let logGroup = objectlog.enter;
		let logUngroup = objectlog.exit;

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
		
		function saveNewRecord(dataRecord) {
			let id = dataRecords.length;
			// dataRecord.id = "_id_" + id + "_di_"; // debug
			
			let copy = { id : "_id_" + id + "_di_" };
			Object.assign(copy, dataRecord);
			dataRecord = copy;
			
			// console.log("saveNewRecord");
			// console.log(dataRecord);
			dataRecords.push(JSON.stringify(dataRecord));
			return id;
		}

		function updateRecord(id, contents) {
			// contents.id = "_id_" + id + "_di_";

			let copy = { id : "_id_" + id + "_di_" };
			Object.assign(copy, contents);
			contents = copy;

			// console.log("updateRecord");
			dataRecords[id] = JSON.stringify(contents);
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
			getRecord : getRecord,
			deleteRecord : deleteRecord,
			getAllRecordsParsed : getAllRecordsParsed,
			getRecordsCount : getRecordsCount,
			clearDatabase : clearDatabase
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

