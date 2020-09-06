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
  // log("before")
  await world.startDatabase();
  persistent = world.persistent; 
});

after(async () => {
  // log("after")
  await world.stopDatabase();
});

describe("basic operations", function() {

  async function volatileReset() {
    await world.volatileReset();
    persistent = world.persistent;
  }
  
  async function persistentReset() {
    await world.persistentReset();
    persistent = world.persistent;
  }
  
  it('should save persistent globals (non objects) + reset database', async function() {
    // log("--------------------------------------------------");
    persistent.foo = 42;
    assert.equal(42, persistent.foo);

    // logToFile(world.mockMongoDB.getAllRecordsParsed(), 10, "./databaseDump2.json");


    // logToFile(world.mockMongoDB.getAllRecordsParsed(), 10, "./databaseDump3.json");
    // endTransaction();
    await volatileReset();
    await logToFile(world.mockMongoDB.getAllRecordsParsed(), 10, "./databaseDump.json");
    // log("FINISHED")
    // logToFile(world.mockMongoDB.getAllRecordsParsed(), 10, "./databaseDump4.json");
    // log(persistent.loaded);
    // log(world.eternityState);


    // assert.equal(true, persistent.loaded);   
    // assert.equal(42, persistent.foo);   
    
    // log("--------------------------------------------------");
    await persistentReset();
    assert.equal(true, typeof(persistent.foo) === 'undefined');

    // load(persistent, () => {
    //   assert.equal(44, persistent.foo);
    // });
  });
});


 //  it('should save persistent globals', function () {
  //  // log("=============================");
  //  let A = create({name : 'A'});
  //  persistent.A = A;
    
  //  volatileReset();
    
  //  assert.notEqual(A, persistent.A); // Should now be a different eternity object... freshly loaded.
  //  A = persistent.A;
  //  // log(persistent);
  //  // log(persistent.A);
  //  assert.equal("A", persistent.A.name);
    
  //  persistentReset();
  // });
  
 //  it('should save refered objects recursivley', function () {
  //  // log("=============================");
  //  // log(eternity.mockMongoDB.getAllRecordsParsed(), 3);
    
  //  let A = create({name : 'A'});
  //  let B = create({name : 'B'});
  //  B.bitsAndPieces = 256;
  //  A.B = B;
  //  persistent.A = A;   
    
  //  volatileReset();
    
  //  assert.equal(256, persistent.A.B.bitsAndPieces);

  //  persistentReset();
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
    
  //  volatileReset();
    
  //  assert.equal("B", persistent.A.B.name);

  //  persistentReset();
  // });
  
  
  // it('should save refered objects recursivley, continue after save', function () {
  //  let A = create({name : 'A'});
  //  persistent.A = A;
  //  // log(eternity.mockMongoDB.getAllRecordsParsed(), 3);  
        
  //  volatileReset();
  //  // log("==================== CLEAR MEMORY ==========================");

  //  A = persistent.A;
  //  let B = create({name : 'B'});
  //  B.bitsAndPieces = 256;
  //  A.B = B;  
    
  //  assert.equal(256, persistent.A.B.bitsAndPieces);

  //  persistentReset(); // TODO: Cannot run in sequence with unloadAll
  // });
   
  
  
    // it('should garbage collect persistent structures no longer reachable', function () {
  // });    
  
  // it('should be possible to have persistent repeaters', function () {
  // });  
    
  // it('should be possible to have persistent cached calls', function () {
  // });  


