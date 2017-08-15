const assert = require('assert');
// const log = console.log.bind(console);

// Neat logging
let objectlog = require('../objectlog.js');
let log = objectlog.log;
let logGroup = objectlog.enter;
let logUngroup = objectlog.exit;

// Tests based on mobx test/array.js
describe("garbage-collection", function () {

	function unloadAllAndClearMemory() {
		eternity.unloadAllAndClearMemory();
		persistent = eternity.persistent;
	}
	
	function clearDatabaseAndClearMemory() {
		eternity.clearDatabaseAndClearMemory();
		persistent = eternity.persistent;
	}
	
    // it('should garbage collect one thing', function () {
		// let eternity = require('../eternity')({name: "collecting.js", maxNumberOfLoadedObjects : 200});  // Includes persistent root.
		// let create = eternity.create;
		// let persistent = eternity.persistent;
		
		// let a = create({name: "a"});
		// persistent.a = a;

		
		// // log(a.const);
		// assert.equal(typeof(a.const.dbImage) !== 'undefined', true);
		
		// // delete persistent.a;
		// persistent.a = null;
		
		// // log(eternity.mockMongoDB.getAllRecordsParsed(), 3);
		// log("=======================================================");
		// eternity.trace.eternity = true;
		// eternity.oneStepCollection();
		// log("-------------------------------------------------------");
		// eternity.oneStepCollection();
		// log("-------------------------------------------------------");
		// eternity.oneStepCollection();
		// log("-------------------------------------------------------");
		// eternity.collectAll();
		// delete eternity.trace.eternity;
		// assert.equal(typeof(a.const.dbImage) === 'undefined', true);
	// });
});