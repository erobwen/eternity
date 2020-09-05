'use strict';
require = require("esm")(module);
const assert = require('assert');
const world = require('../eternity.js').getWorld({name: "basics.js"});
let persistent;
const log = console.log;
const { create, whileLoaded, logToFile } = world;

const { endTransaction } = world;

// 'use strict';
// require = require("esm")(module);
// const {observable, repeat,trace} = require("../causality.js").getWorld({name: "array-splices", emitEvents: true});
// const assert = require('assert');

// Neat logging
// let objectlog = require('../objectlog.js');
// let log = objectlog.log;
// let logGroup = objectlog.enter;
// let logUngroup = objectlog.exit;

// Tests based on mobx test/array.js

before(async () => {
  await world.setupDatabase();
  persistent = world.persistent; 
});

describe("basics", function() {
  
  async function unloadAll() {
    await world.unloadAll();
    persistent = world.persistent;
  }
  
  async function unloadAllAndClearDatabase() {
    await world.unloadAllAndClearDatabase();
    persistent = world.persistent;
  }
  
  it('should save persistent globals (non objects) + reset database', async function() {
    console.log("foobar")
    persistent.foo = 42;
    logToFile(world.mockMongoDB.getAllRecordsParsed(), 10, "./databaseDump.json");
    endTransaction();
    logToFile(world.mockMongoDB.getAllRecordsParsed(), 10, "./databaseDump.json");
    assert.equal(42, persistent.foo);

    console.log("foobar2")
    logToFile(world.mockMongoDB.getAllRecordsParsed(), 10, "./databaseDump.json");
    await unloadAll();

    log("after unload all...");
    logToFile(world.mockMongoDB.getAllRecordsParsed(), 10, "./databaseDump.json");
    log("--------------------------------------------------");
    log(persistent.loaded);
    log(world.eternityState);


    assert.equal(42, persistent.foo);   
    console.log("foobar3")
    
    await unloadAllAndClearDatabase();
    assert.equal(true, typeof(persistent.foo) === 'undefined');
    console.log("foobar4")

    load(persistent, () => {
      assert.equal(44, persistent.foo);
    });
  });
});


 //  it('should save persistent globals', function () {
  //  // log("=============================");
  //  let A = create({name : 'A'});
  //  persistent.A = A;
    
  //  unloadAll();
    
  //  assert.notEqual(A, persistent.A); // Should now be a different eternity object... freshly loaded.
  //  A = persistent.A;
  //  // log(persistent);
  //  // log(persistent.A);
  //  assert.equal("A", persistent.A.name);
    
  //  unloadAllAndClearDatabase();
  // });
  
 //  it('should save refered objects recursivley', function () {
  //  // log("=============================");
  //  // log(eternity.mockMongoDB.getAllRecordsParsed(), 3);
    
  //  let A = create({name : 'A'});
  //  let B = create({name : 'B'});
  //  B.bitsAndPieces = 256;
  //  A.B = B;
  //  persistent.A = A;   
    
  //  unloadAll();
    
  //  assert.equal(256, persistent.A.B.bitsAndPieces);

  //  unloadAllAndClearDatabase();
  // });
  
  
  // it('should save refered objects recursivley, in steps', function () {
  //  // eternity.pulse(function() {
      
  //    persistent.A = create({name : 'A'});
  //    // log("------------------------------------------------------------");
  //    // log(persistent.A, 2);
  //  // });
  //  persistent.A.B = create({name : 'B'});
  //  // log("------------------------------------------------------------");
  //  assert.equal("B", persistent.A.B.name);
    
  //  // log(eternity.mockMongoDB.getAllRecordsParsed(), 3);  
    
  //  unloadAll();
    
  //  assert.equal("B", persistent.A.B.name);

  //  unloadAllAndClearDatabase();
  // });
  
  
  // it('should save refered objects recursivley, continue after save', function () {
  //  let A = create({name : 'A'});
  //  persistent.A = A;
  //  // log(eternity.mockMongoDB.getAllRecordsParsed(), 3);  
        
  //  unloadAll();
  //  // log("==================== CLEAR MEMORY ==========================");

  //  A = persistent.A;
  //  let B = create({name : 'B'});
  //  B.bitsAndPieces = 256;
  //  A.B = B;  
    
  //  assert.equal(256, persistent.A.B.bitsAndPieces);

  //  unloadAllAndClearDatabase(); // TODO: Cannot run in sequence with unloadAll
  // });
   
  
  
    // it('should garbage collect persistent structures no longer reachable', function () {
  // });    
  
  // it('should be possible to have persistent repeaters', function () {
  // });  
    
  // it('should be possible to have persistent cached calls', function () {
  // });  


