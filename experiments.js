// let eternity = require("./eternity.js")();

let storedName = "asdfasdf(dbImage)";
console.log(storedName.substring(0, storedName.length - 9));


// function createInstance(configuration) {
	// function method() {		
		// console.log(configuration.name + "_" + instanceGlobal);
	// }
	
	// let instanceGlobal = "42" + configuration.name;

	// function create() {
		// return {
			// method: method
		// };
	// }
	// function someFunction(object) {
		// object.method();
	// }
	
	// return {
		// create: create, 
		// someFunction: someFunction
	// }
// }


// let a = createInstance({name: "A"});
// let b = createInstance({name: "B"});

// aObject = a.create();
// bObject = b.create();
// a.someFunction(aObject);
// b.someFunction(bObject);

// b.someFunction(aObject);
// a.someFunction(bObject);


// // Neat logging
// // let objectlog = require('../objectlog.js');
// // let log = objectlog.log;
// // let logGroup = objectlog.enter;
// // let logUngroup = objectlog.exit;
// let log = eternity.log;
// let logGroup = eternity.enter;
// let logUngroup = eternity.exit;


// let create = eternity.create;
// let persistent = eternity.persistent;
// let a = create({name: "a"});
// // log("------------------------------------------");
// // eternity.trace.flush = 1;
// eternity.pulse(function() {
	// persistent.a = a;
// });
// // log("-------");
// eternity.flushToDatabase();
// log(eternity.mockMongoDB.getAllRecordsParsed(), 10);
// // // log("------------------------------------------");
// // assert.equal(typeof(a.const.dbImage) !== 'undefined', true);
// // // eternity.trace.flush = 0;

// // eternity.flushToDatabase();
// // // log(eternity.mockMongoDB.getAllRecordsParsed(), 10);
// // let aDbId = a.const.dbImage.const.dbId;

// // persistent.a = null;
// // eternity.flushToDatabase();


// // console.log(eternity.mockMongoDB.getAllRecordsParsed(), 10);


// // let foo = create({name: "foo", const: {someProperty : 42}});
// // console.log(foo.const.someProperty);
