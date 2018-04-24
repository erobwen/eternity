const assert = require('assert');
// const log = console.log.bind(console);

// Neat logging
let objectlog = require('../objectlog.js');
let log = objectlog.log;
let logGroup = objectlog.enter;
let logUngroup = objectlog.exit;
let eternity = require('../eternity')({
	name: "collecting.js", 
	maxNumberOfLoadedObjects : 200
});  // Includes persistent root.

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
	
    it('should garbage collect one thing in 6 steps', function () {
		let create = eternity.create;
		let persistent = eternity.persistent;
		let a = create({name: "a"});
		// log("------------------------------------------");
		// eternity.trace.flush = 1;
		persistent.a = a;
		// log("-------");
		eternity.flushToDatabase();
		// log("------------------------------------------");
		assert.equal(typeof(a.const.dbImage) !== 'undefined', true);
		// eternity.trace.flush = 0;
		
		eternity.flushToDatabase();
		let aDbId = a.const.dbImage.const.dbId;

		persistent.a = null;
		eternity.flushToDatabase();

		// GC in 6 steps
		eternity.oneStepCollection();
		eternity.oneStepCollection();
		eternity.oneStepCollection();
		eternity.oneStepCollection();
		// log("----------------------------------------")
		// eternity.trace.flush = 1;
		// eternity.trace.eternity = true;
		eternity.oneStepCollection();		
		eternity.oneStepCollection();
		eternity.flushToDatabase();
		// eternity.trace.eternity = false;
		// log("----------------------------------------")
	
		assert.equal(typeof(a.const.dbImage) === 'undefined', true);
		// log("pending updates: " + eternity.pendingUpdates.length);
		// log("aDbId: ", aDbId);
		// log(eternity.mockMongoDB.getAllRecordsParsed(), 10);
		assert.ok(eternity.mockMongoDB.isDeallocated(aDbId));
				
		eternity.trace.eternity = true;
		delete eternity.trace.eternity;
	});
	
	
	it('should garbage collect recursivley, while keeping some', function () {
		let eternity = require('../eternity')({name: "collecting.js", maxNumberOfLoadedObjects : 200});  // Includes persistent root.
		let create = eternity.create;
		let persistent = eternity.persistent;
		// return;

		let a = create({name: "a"});
		let b = create({name : "b"});
		let c = create({name : "c"});
		let d = create({name : "d"});
		let e = create({name : "e"});
		
		// Connect tree bottom up, verify all is persistent
		d.e = e;
		b.c = c;
		b.d = d;
		a.b = b;
		persistent.a = a;
		persistent.d = d;
		eternity.flushToDatabase();
		
		//        persistent
		//          |   |
		//          a   |
		//          |   |
		//          b   |
		//         / \ /
		//        c   d
		//             \
		//              e
		
		// All should be persistent
		assert.equal(typeof(a.const.dbImage) !== 'undefined', true);
		assert.equal(typeof(b.const.dbImage) !== 'undefined', true);
		assert.equal(typeof(c.const.dbImage) !== 'undefined', true);
		assert.equal(typeof(d.const.dbImage) !== 'undefined', true);
		assert.equal(typeof(e.const.dbImage) !== 'undefined', true);
		eternity.flushToDatabase();
		let aDbId = a.const.dbImage.const.dbId;
		let bDbId = b.const.dbImage.const.dbId;
		let cDbId = c.const.dbImage.const.dbId;
		
		
		// Dissconnect a from persistent
		persistent.a = null;
		eternity.flushToDatabase();

		// Garbage collect
		eternity.collectAll();

		// d and e are still persistent because persistent pointe to d
		assert.equal(typeof(a.const.dbImage) === 'undefined', true);
		assert.equal(typeof(b.const.dbImage) === 'undefined', true);
		assert.equal(typeof(c.const.dbImage) === 'undefined', true);
		assert.equal(typeof(d.const.dbImage) !== 'undefined', true);
		assert.equal(typeof(e.const.dbImage) !== 'undefined', true);
		
		// Unload all and clear locals
		a = b = c = d = e = null;
		unloadAllAndClearMemory();
		
		// Check still persistent
		assert.equal(typeof(persistent.d.const.dbImage) !== 'undefined', true);
		assert.equal(typeof(persistent.d.e.const.dbImage) !== 'undefined', true);
		
		// Check deallocated
		assert.ok(eternity.mockMongoDB.isDeallocated(aDbId));
		assert.ok(eternity.mockMongoDB.isDeallocated(bDbId));
		assert.ok(eternity.mockMongoDB.isDeallocated(cDbId));
	});
});
