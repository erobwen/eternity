
const assert = require('assert');

let classRegistry = {};
let eternity = require('../eternity')({
	name: "incoming.js", 
	persistentIncomingChunkSize: 1, 
	causalityConfiguration : {
		classRegistry : classRegistry
	}
});

// Setup classes
function CollectorClass() {
	this.keep = eternity.create([]);
}
CollectorClass.prototype.collect = function(refering) {
	this.keep.push(refering);
}
classRegistry.CollectorClass = CollectorClass;

// Shortcuts
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
	
	function unloadAll() {
		eternity.unloadAll();
		persistent = eternity.persistent;
	}
	
	function unloadAllAndClearDatabase() {
		eternity.unloadAllAndClearDatabase();
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

		unloadAll();
		// log("==================== CLEAR MEMORY ==========================");
		
		referers = [];
		eternity.forAllPersistentIncomingNow(persistent.A.D, "D", function(referer) {
			referers.push(referer);
		});
		assert.equal(3, referers.length);
		assert.equal(persistent.A, referers[0]);		
		assert.equal(persistent.B, referers[1]);		
		assert.equal(persistent.C, referers[2]);
		unloadAllAndClearDatabase();		
	});	
	
	
	it('should save multiple incoming relations, iterate persistent incoming, persistently', function () {
		persistent.A = create({name : 'A'});
		persistent.B = create({name : 'B'});
		persistent.C = create({name : 'C'});
		
		let D = create({name : 'D'});
		// log("----now only assigning D---");
		persistent.A.D = D;
		persistent.B.D = D;
		persistent.C.D = D;
	
		// log(eternity.mockMongoDB.getAllRecordsParsed(), 3);	

		unloadAll();
		// log("==================== CLEAR MEMORY ==========================");
		
		referers = [];
		let collector = create({
			name : "collector",
			iterate : function(referer) {
				// log(" Iterate in application");
				referers.push(referer);
			}
		});
		
		eternity.forAllPersistentIncomingNow(persistent.A.D, "D", eternity.createAction(collector, "iterate"));
		// log(referers);
		assert.equal(referers.length, 3);
		assert.equal(persistent.A, referers[0]);		
		assert.equal(persistent.B, referers[1]);		
		assert.equal(persistent.C, referers[2]);		
		unloadAllAndClearDatabase();		
	});
	
	
	
	it('should save multiple incoming relations, iterate persistent incoming, persistently with class collector', function () {
		persistent.A = create({name : 'A'});
		persistent.B = create({name : 'B'});
		persistent.C = create({name : 'C'});
		
		let D = create({name : 'D'});
		// log("----now only assigning D---");
		persistent.A.D = D;
		persistent.B.D = D;
		persistent.C.D = D;
	
		let collector = create(new CollectorClass());

		// log(eternity.mockMongoDB.getAllRecordsParsed(), 3);	

		unloadAll();
		// log("==================== CLEAR MEMORY ==========================");
		
		
		
		eternity.forAllPersistentIncomingNow(persistent.A.D, "D", eternity.createAction(collector, "collect"));
		assert.equal(3, collector.keep.length);
		assert.equal(persistent.A, collector.keep[0]);		
		assert.equal(persistent.B, collector.keep[1]);		
		assert.equal(persistent.C, collector.keep[2]);		
		unloadAllAndClearDatabase();		
	});
});