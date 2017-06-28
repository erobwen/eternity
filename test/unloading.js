const assert = require('assert');
// const log = console.log.bind(console);

// Neat logging
let objectlog = require('../objectlog.js');
let log = objectlog.log;
let logGroup = objectlog.enter;
let logUngroup = objectlog.exit;

// Tests based on mobx test/array.js
describe("basics", function () {

    it('should unload nodes as memory reaches limit, circluar path', function () {
		let eternity = require('../eternity')({maxNumberOfAliveObjects : 3});
		let create = eternity.create;
		let persistent = eternity.persistent;
	});

    // it('should unload nodes as memory reaches limit, circluar infinite path', function () {
	// });

    // it('should handle zombie objects correctly', function () {
	// });	
	
	
});


