let eternity = require("./eternity.js")();

// Neat logging
// let objectlog = require('../objectlog.js');
// let log = objectlog.log;
// let logGroup = objectlog.enter;
// let logUngroup = objectlog.exit;
let log = eternity.log;
let logGroup = eternity.enter;
let logUngroup = eternity.exit;


let create = eternity.create;
let persistent = eternity.persistent;
let a = create({name: "a"});
// log("------------------------------------------");
// eternity.trace.flush = 1;
eternity.pulse(function() {
	persistent.a = a;
});
// log("-------");
eternity.flushToDatabase();
log(eternity.mockMongoDB.getAllRecordsParsed(), 10);
// // log("------------------------------------------");
// assert.equal(typeof(a.const.dbImage) !== 'undefined', true);
// // eternity.trace.flush = 0;

// eternity.flushToDatabase();
// // log(eternity.mockMongoDB.getAllRecordsParsed(), 10);
// let aDbId = a.const.dbImage.const.dbId;

// persistent.a = null;
// eternity.flushToDatabase();


// console.log(eternity.mockMongoDB.getAllRecordsParsed(), 10);


// let foo = create({name: "foo", const: {someProperty : 42}});
// console.log(foo.const.someProperty);
