const assert = require('assert');
let eternity = require('../eternity')({name: "basics.js"});
let create = eternity.create;
let persistent = eternity.persistent;
// const log = console.log.bind(console);

// Neat logging
let objectlog = require('../objectlog.js');
let log = objectlog.log;
let logGroup = objectlog.enter;
let logUngroup = objectlog.exit;

// Tests based on mobx test/array.js
describe("basics", function () {
	
	function unloadAllAndClearMemory() {
		eternity.unloadAllAndClearMemory();
		persistent = eternity.persistent;
	}
	
	function clearDatabaseAndClearMemory() {
		eternity.clearDatabaseAndClearMemory();
		persistent = eternity.persistent;
	}
	
	it('should save persistent globals (non objects) + reset database', function() {
		// log("Database contents:");
		// log(eternity.mockMongoDB.getAllRecordsParsed(), 3);	

		persistent.foo = 42;
		assert.equal(42, persistent.foo);

		// log("Database contents:");
		// log(eternity.mockMongoDB.getAllRecordsParsed(), 3);	

		// assert.equal(2, eternity.mockMongoDB.getRecordsCount());
		// assert.equal(42, eternity.mockMongoDB.getRecord(1).foo);

		unloadAllAndClearMemory();
		
		assert.equal(42, persistent.foo);		
		
		clearDatabaseAndClearMemory();
		
		assert.equal(true, typeof(persistent.foo) === 'undefined');
	});
	
    it('should save persistent globals', function () {
		// log("=============================");
		let A = create({name : 'A'});
		persistent.A = A;
		
		unloadAllAndClearMemory();
		
		assert.notEqual(A, persistent.A); // Should now be a different eternity object... freshly loaded.
		A = persistent.A;
		// log(persistent);
		// log(persistent.A);
		assert.equal("A", persistent.A.name);
		
		clearDatabaseAndClearMemory();
	});
	
    it('should save refered objects recursivley', function () {
		// log("=============================");
		// log(eternity.mockMongoDB.getAllRecordsParsed(), 3);
		
		let A = create({name : 'A'});
		let B = create({name : 'B'});
		B.bitsAndPieces = 256;
		A.B = B;
		persistent.A = A;		
		
		unloadAllAndClearMemory();
		
		assert.equal(256, persistent.A.B.bitsAndPieces);

		clearDatabaseAndClearMemory();
	});
	
	
	it('should save refered objects recursivley, in steps', function () {
		persistent.A = create({name : 'A'});
		// log(persistent.A, 2);
		persistent.A.B = create({name : 'B'});
		assert.equal("B", persistent.A.B.name);
		
		// log(eternity.mockMongoDB.getAllRecordsParsed(), 3);	
		
		unloadAllAndClearMemory();
		
		assert.equal("B", persistent.A.B.name);

		clearDatabaseAndClearMemory();
	});
	
	
	it('should save refered objects recursivley, continue after save', function () {
		let A = create({name : 'A'});
		persistent.A = A;
		// log(eternity.mockMongoDB.getAllRecordsParsed(), 3);	
				
		unloadAllAndClearMemory();
		// log("==================== CLEAR MEMORY ==========================");

		A = persistent.A;
		let B = create({name : 'B'});
		B.bitsAndPieces = 256;
		A.B = B;	
		
		assert.equal(256, persistent.A.B.bitsAndPieces);

		clearDatabaseAndClearMemory(); // TODO: Cannot run in sequence with unloadAllAndClearMemory
	});
	 
	
	
    // it('should garbage collect persistent structures no longer reachable', function () {
	// });	  
	
	// it('should be possible to have persistent repeaters', function () {
	// });	
		
	// it('should be possible to have persistent cached calls', function () {
	// });	
});


