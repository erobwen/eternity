const assert = require('assert');
const log = console.log.bind(console);
const fs = require('fs');

it('validate', function(){

    const data = fs.readFileSync('../bower.json');
    const json = JSON.parse(data);
    // const bj = require('bower-json');
    // const norm = bj.parse(json);

    assert.equal(json.main, "causality.js");
});
