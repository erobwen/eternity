const assert = require('assert');
let causality = require('../causality')({useIncomingStructures : true, incomingReferenceCounters : true});
let create = causality.create;
let forAllIncoming = causality.forAllIncoming;
let log = require("../objectlog.js").log;


describe("Incoming Relations", function(){

    it("Test incoming helper", function(){
		let Origin = {};
		
		
		let Target = {};
	});
});