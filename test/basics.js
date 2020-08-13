'use strict';
require = require("esm")(module);
const assert = require('assert');
const world = require('../eternity.js').getWorld({name: "basics.js"});
const { create, load } = world;
// const log = console.log.bind(console);

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
describe("basics", async function() {
  
  await world.setupDatabase()
  let persistent = world.persistent; 

  async function unloadAll() {
    world.unloadAll();
    persistent = world.persistent;
  }
  
  async function unloadAllAndClearDatabase() {
    world.unloadAllAndClearDatabase();
    persistent = world.persistent;
  }
  
  it('should save persistent globals (non objects) + reset database', async function() {

    persistent.foo = 42;
    assert.equal(42, persistent.foo);

    unloadAll();
    
    assert.equal(42, persistent.foo);   
    
    await unloadAllAndClearDatabase();
    assert.equal(true, typeof(persistent.foo) === 'undefined');

    load(persistent, () => {
      assert.equal(42, persistent.foo);
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
});


