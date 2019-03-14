let log = console.log;
let idObjectMap = {};
let objects = [];
let objectCount = 500;
for (let i = 0; i < objectCount; i++) {
  let object = { id: "id_" + i + "_id"};
  objects.push(object);
  idObjectMap[object.id] = object;
}

function findInArray(object, array) {
  for (let i = 0, len = array.length; i < len; i++) {
    if (object === array[i]) return i;
  }
}

function removeObject(objects, object) {
  objects.splice(objects.indexOf(object), 1);
}

function randomObject() {
  let randomIndex = Math.floor(Math.random() * objectCount);
  return objects[randomIndex];
}

let operations;

console.time("Object");
operations = 1000;
while(operations-- > 0) {
  let object = randomObject();
  // log(object);
  
  // Object
  delete idObjectMap[object.id];
  idObjectMap[object.id] = object;
}
console.timeEnd("Object");



console.time("Array");
operations = 1000;
while(operations-- > 0) {
  let object = randomObject();
  
  // Array
  removeObject(objects, object);
  objects.push(object);
}
console.timeEnd("Array");


