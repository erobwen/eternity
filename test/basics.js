const assert = require('assert');
require('../eternity');
const log = console.log.bind(console);

// Tests based on mobx test/array.js
describe("basics", function () {
    it('should save properly for the first time', function () {
    
	// imageCausality.pulse(function(){
		causality.pulse(function() {
			let a = create({name : "a"});
			// console.log(a.const.id);
			let b = create({name : "b"});
			// console.log(b.const.id);
			let c = create({name : "c"});
			// console.log(c.const.id);
			let d = create({name : "d"});
			// console.log(d.const.id);
			
			transaction(function() {
				a.B = b;
				b.A = a;
			}); 
			
			a._independentlyPersistent = true;

			// log(a.const.dbImage, 2);	
		});
	// });




    });
});


