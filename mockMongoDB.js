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
		dataRecord.id = id;
		console.log("saveNewRecord");
		console.log(dataRecord);
		dataRecords.push(JSON.stringify(dataRecord));
		return id;
	}

	function updateRecord(id, contents) {
		contents.id = id;
		console.log("updateRecord");
		dataRecords[id] = JSON.stringify(contents);
		return id;
	}
	
	function updateRecordPath(id, path, value) {
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
		return JSON.parse(dataRecords[id]);
	}		
	
	function deleteRecord(id) {
		dataRecords[id] = null; // Do not delete it as we want to keep nextId = records.length.
	}	
	
	return {
		saveNewRecord : saveNewRecord,
		updateRecord : updateRecord,
		updateRecordPath : updateRecordPath,
		getRecord : getRecord,
		deleteRecord : deleteRecord,
		getAllRecordsParsed : getAllRecordsParsed
	};
}));

