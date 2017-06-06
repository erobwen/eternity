let eternity = require("./eternity.js");
eternity.install();

eternity.pulse(function() {
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


