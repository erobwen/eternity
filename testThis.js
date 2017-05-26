

let x = {
	xField : 42,
	y : {}
}

x.y.foo = function() {
	return this.xField;
}.bind(x);

console.log(x.y.foo());