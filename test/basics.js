const assert = require('assert');
let eternity = require('../eternity');
const log = console.log.bind(console);

// Tests based on mobx test/array.js
describe("basics", function () {
	// it('should create persistent globals', function() {
		// eternity.persistent.foo = 42;
		// assert.equal(42, eternity.persistent.foo);
		// assert.equal(1, eternity.mockMongoDB.getRecordsCount());
		// assert.equal(42, eternity.mockMongoDB.getRecord(0).foo);
		
		// eternity.unloadAllAndClearMemory();
		
		// assert.equal(42, eternity.persistent.foo);
		
		// eternity.clearDatabaseAndClearMemory();
		// assert.equal(true, typeof(eternity.persistent.foo) === 'undefined');
	// });
	
    it('should save refered objects, at once and later added', function () {
		let A = eternity.create({name : 'A'});
		eternity.persistent.A = A;
		assert.equal("A", eternity.persistent.A.name);
		console.log(eternity.mockMongoDB.getAllRecordsParsed());
		eternity.unloadAllAndClearMemory();
		
		console.log(eternity.persistent.A);
		console.log("=========================================");
		assert.equal("A", eternity.persistent.A.name);
		// assert.notEqual(A, eternity.persistent.A); // Should now be a different eternity object... freshly loaded.

		eternity.clearDatabaseAndClearMemory();
	});
});


