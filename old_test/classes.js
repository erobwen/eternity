// Setup classes
function MyClass() {
	this.foobar = 42;
}
MyClass.prototype.getFoobar = function() {
	return this.foobar;
}
let classRegistry = {MyClass : MyClass};

const assert = require('assert');
let eternity = require('../eternity')({
	name: "classes.js", // Note: name is necessary, since class registry will be invisible to configuration comparer....
	causalityConfiguration : {
		classRegistry : classRegistry
	}
}); 
let create = eternity.create;
let persistent = eternity.persistent;
// const log = console.log.bind(console);

// Neat logging
let objectlog = require('../objectlog.js');
let log = objectlog.log;
let logGroup = objectlog.enter;
let logUngroup = objectlog.exit;


// Tests based on mobx test/array.js
describe("classes", function () {
	
	function unloadAll() {
		eternity.unloadAll();
		persistent = eternity.persistent;
	}
	
	function unloadAllAndClearDatabase() {
		eternity.unloadAllAndClearDatabase();
		persistent = eternity.persistent;
	}
	
	
    it('should persist class belongings', function () {
		persistent.x = create(new MyClass());
		unloadAll();
		// log("==================== CLEAR MEMORY ==========================");
		unloadAll();
		
		// log(eternity.mockMongoDB.getAllRecordsParsed(), 3);	
		
		assert.equal("MyClass", Object.getPrototypeOf(persistent.x).constructor.name);
		assert.equal(42, persistent.x.getFoobar());
		unloadAllAndClearDatabase();
	});	
	
	it('should persist arrays', function () {
		persistent.x = create([42]); // Consider... maybe even causality need to create a new object and record all assignments... 
		unloadAll();
		// log("==================== CLEAR MEMORY ==========================");
		unloadAll();
		
		// log(eternity.mockMongoDB.getAllRecordsParsed(), 3);	
		
		assert.equal("Array", Object.getPrototypeOf(persistent.x).constructor.name);
		assert.equal(42, persistent.x.shift()); //
		unloadAllAndClearDatabase();
	});	  
});

