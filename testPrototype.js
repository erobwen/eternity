function MyClass() {
	this.foo = 20;
}
MyClass.prototype.myClassConst = 100;

// let x = new MyClass();

let y = "MyClass";

let target = (typeof(global) !== 'undefined') ? global : window;

target.MyClass = MyClass;
console.log(eval(y));
console.log(eval(y).prototype);
console.log(MyClass.prototype);
// console.log(target[y]);
// console.log(target.MyClass);
// console.log(target);
// let x = new (eval(y))();
let x = Object.create(eval(y).prototype);
console.log(x.myClassConst);

let z = new MyClass();
console.log(Object.getPrototypeOf(z).constructor.name);

console.log("============== Array experiments ====================");

let array = ["A", "B", "C"];
console.log(array);
console.log(Object.getPrototypeOf(array).constructor.name);

let funkyArray = Object.create(eval("Array").prototype);
// let funkyArray = Object.create(Array.prototype);
funkyArray.push("A");
funkyArray.push("B");
funkyArray.push("C");
console.log(funkyArray);


console.log("============== Object experiments ====================");

let object = {a: "A", b: "B", c: "C"};
console.log(object);
console.log(Object.getPrototypeOf(object).constructor.name);

let funkyObject = Object.create(eval("Object").prototype);
// let funkyArray = Object.create(Object.prototype);
funkyObject.a = "A";
funkyObject.b = "B";
funkyObject.c = "C";
console.log(funkyObject);

console.log("==== asdf ==== ");
let foozebar = {};
function f(a) {
	console.log(typeof(a) === 'undefined');
}
f(foozebar.gazong);

