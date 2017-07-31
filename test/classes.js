// Setup classes
function MyClass() {
	this.foobar = 42;
}
MyClass.prototype.getFoobar = function() {
	return this.foobar;
}
let classRegistry = {MyClass : MyClass};

const assert = require('assert');
let eternity = require('../eternity')({classRegistry : classRegistry});
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
	
	
    it('should persist class belongings', function () {
		persistent.x = create(new MyClass());
		unloadAllAndClearMemory();
		// log("==================== CLEAR MEMORY ==========================");
		unloadAllAndClearMemory();
		
		log(eternity.mockMongoDB.getAllRecordsParsed(), 3);	
		
		assert.equal("MyClass", Object.getPrototypeOf(persistent.x).constructor.name);
		assert.equal(42, persistent.x.getFoobar());
	});	  
});

