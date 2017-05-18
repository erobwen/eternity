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
	
	function saveNewRecord(dataRecord) {
		this.dataRecords.push(JSON.stringify(dataRecord));
		return this.dataRecords.length - 1;
	}

	function updateRecord(id, contents) {
		this.dataRecords[id] = JSON.stringify(contents);
		return id;
	}
	
	function updateRecordPath(id, path, value) {
		let record = this.getRecord(id);
		let property = path[path.length - 1];
		let index = 0;
		let target = record;
		while(index < path.length - 1) {
			target = target[path[index]];
			index++;
		}
		target[property] = value;
		this.dataRecords[id] = JSON.stringify(record);
	}
	
	function getRecord(id) {
		return JSON.parse(dataRecords[id]);
	}		
	
	function deleteRecord(id) {
		delete dataRecords[id];
	}	
	
	return {
		saveNewRecord : saveNewRecord,
		updateRecord : updateRecord,
		updateRecordPath : updateRecordPath,
		getRecord : getRecord,
		deleteRecord : deleteRecord
	};
}));

