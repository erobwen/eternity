const assert = require('assert');
let eternity = require('../eternity')({name: "incoming.js", persistentIncomingChunkSize: 1});
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
	
	it('should save multiple incoming relations, iterate persistent incoming, volatiley', function () {
		persistent.A = create({name : 'A'});
		persistent.B = create({name : 'B'});
		persistent.C = create({name : 'C'});
		
		let D = create({name : 'D'});
		// log("----now only assigning D---");
		persistent.A.D = D;
		persistent.B.D = D;
		persistent.C.D = D;
	
		// log(eternity.mockMongoDB.getAllRecordsParsed(), 3);	

		unloadAllAndClearMemory();
		// log("==================== CLEAR MEMORY ==========================");
		
		referers = [];
		eternity.forAllPersistentIncomingNow(persistent.A.D, "D", function(referer) {
			referers.push(referer);
		});
		assert.equal(3, referers.length);
		assert.equal(persistent.A, referers[0]);		
		assert.equal(persistent.B, referers[1]);		
		assert.equal(persistent.C, referers[2]);		
	});	
	
	
	// it('should save multiple incoming relations, iterate persistent incoming, persistently', function () {
		// persistent.A = create({name : 'A'});
		// persistent.B = create({name : 'B'});
		// persistent.C = create({name : 'C'});
		
		// let D = create({name : 'D'});
		// log("----now only assigning D---");
		// persistent.A.D = D;
		// persistent.B.D = D;
		// persistent.C.D = D;
	
		// log(eternity.mockMongoDB.getAllRecordsParsed(), 3);	

		// unloadAllAndClearMemory();
		// // log("==================== CLEAR MEMORY ==========================");
		
		// referers = [];
		// let collector = create({ iterate : function(referer) {
			// referers.push(referer);
		// }});
		
		// eternity.createPersistentAction();
		
		// eternity.forAllPersistentIncomingNow(persistent.A.D, "D", eternity.createAction(collector, "iterate"));
		// assert.equal(3, referers.length);
		// assert.equal(persistent.A, referers[0]);		
		// assert.equal(persistent.B, referers[1]);		
		// assert.equal(persistent.C, referers[2]);		
	// });
});