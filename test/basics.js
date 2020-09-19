'use strict';
require = require("esm")(module);
const assert = require('assert');
const world = require('../eternity.js').getWorld({name: "basics.js"});
let persistent;
const log = console.log;
function logg() {
  log("-------------------------------------------------");
}
const { create, whileLoaded, loadAndPin, unpin, logToFile } = world;
const meta = "eternity";
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
  await world.startDatabase();
  persistent = world.persistent; 
});

after(async () => {
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
  
  it('should save properties on the persistent object', async function() {
    persistent.foo = 42;
    assert.equal(42, persistent.foo);

    await volatileReset();
    // await logToFile(world.mockMongoDB.getAllRecordsParsed(), 10, "./databaseDump.json");

    assert.equal(true, persistent.loaded);   
    assert.equal(42, persistent.foo);

    await persistentReset();
    
    assert.equal(true, persistent.loaded);   
    assert.equal(true, typeof(persistent.foo) === 'undefined');
  });

  it('should save refered objects', async function () {
    let A = create({name : 'A'});
    persistent.A = A;
    // logg("foo")
    await volatileReset();
    // logg("writing")
    await logToFile(world.mockMongoDB.getAllRecordsParsed(), 10, "./databaseDump.json");
    // logg("wrote")
    A = persistent.A;
    await whileLoaded(A, () => {
      assert.equal("A", A.name);
    });
      
    await persistentReset();
  });


  it('should save refered objects recursivley', async function () {
   let A = create({name : 'A'});
   let B = create({name : 'B'});
   B.bitsAndPieces = 256;
   A.B = B;
   persistent.A = A;   
    
   await volatileReset();
    
   await loadAndPin(persistent.A);
   await loadAndPin(persistent.A.B);

   assert.equal(256, persistent.A.B.bitsAndPieces);

   unpin(persistent.A);
   unpin(persistent.A.B);

   await persistentReset();
  });
});

  

  
  
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


