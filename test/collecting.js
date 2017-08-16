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
		// // return;
		
		// let a = create({name: "a"});
		// persistent.a = a;

		// // log(a.const);
		// assert.equal(typeof(a.const.dbImage) !== 'undefined', true);
		
		// eternity.forAllPersistentIncomingNow(a, "a", function(object) { log("here!");log(object);});
		// // eternity.trace.basic = true;
		// eternity.trace.eternity = true;
		// persistent.a = null;
		// // eternity.trace.basic = false;
		// eternity.trace.eternity = false;
		// // delete persistent.a;
		// eternity.forAllPersistentIncomingNow(a, "a", function(object) { log("here2!");log(object);});
		// return;
		// log("=======================================================");
		// eternity.oneStepCollection();
		// log("-------------------------------------------------------");
		// eternity.oneStepCollection();
		// log("-------------------------------------------------------");
		// eternity.oneStepCollection();
		// log(eternity.mockMongoDB.getAllRecordsParsed(), 3);
		// log("-------------------------------------------------------");
		// return;
		// eternity.collectAll();
		// assert.equal(typeof(a.const.dbImage) === 'undefined', true);
		
		// eternity.trace.eternity = true;
		// delete eternity.trace.eternity;
	// });
});