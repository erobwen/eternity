const assert = require('assert');
let causality = require('../causality')({name: 'recreateTestCausality'});
causality.install();


describe("Recreate", function(){
   
    it("Test basic recreate", function(){
		// assert.equal(flattened.value, number++);
		let state = {};
		
		let a1;
		reCreate(state, () => {
			a1 = create({name: "A"}, "id_A");
		});
		
		let a2;
		reCreate(state, () => {
			a2 = create({name: "A"}, "id_A");
		});
		
		assert.ok(a2 === a1);
    });
});