const assert = require('assert');
let eternity = require('../eternity')({name: "incoming.js", causalityConfiguration: {incomingStructureChunkSize: 1}});
let create = eternity.create;
let persistent = eternity.persistent;
// const log = console.log.bind(console);

// Neat logging
let objectlog = require('../objectlog.js');
let log = objectlog.log;
let logGroup = objectlog.enter;
let logUngroup = objectlog.exit;

// Tests based on mobx test/array.js
describe("incoming", function () {
	
	function unloadAllAndClearMemory() {
		eternity.unloadAllAndClearMemory();
		persistent = eternity.persistent;
	}
	
	function clearDatabaseAndClearMemory() {
		eternity.clearDatabaseAndClearMemory();
		persistent = eternity.persistent;
	}
	
	it('should save multiple incoming relations, iterate persistent incoming', function () {
		persistent.A = create({name : 'A'});
		persistent.B = create({name : 'B'});
		
		let D = create({name : 'D'});
		persistent.A.D = D;
		persistent.B.D = D;
	
		// log(eternity.mockMongoDB.getAllRecordsParsed(), 3);	

		unloadAllAndClearMemory();
		// log("==================== CLEAR MEMORY ==========================");
		
		referers = [];
		eternity.forAllPersistentIncomingNow(persistent.A.D, "D", function(referer) {
			referers.push(referer);
		});
		assert.equal(2, referers.length);
		assert.equal(persistent.A, referers[0]);		
		assert.equal(persistent.B, referers[1]);		
	});
});