let log = console.log;

// let source = {a : 1};
let source = [1, 2, 3];
log("plain object");
log(source);
log(source.constructor.name);
log();

// source = Object.create(source);
// source.field = true;
// log("created object with prototype");
// log(source);
// log(source.constructor.name);
// log();

source = Object.getPrototypeOf(source);
log("1 st proto");
log(source);
log(source.constructor.name);
log();

source = Object.getPrototypeOf(source);
log("2 st proto");
log(source);
log(source.constructor.name);
log();

source = Object.getPrototypeOf(source);
log("3 st proto");
log(source);
log(source.constructor.name);
log();