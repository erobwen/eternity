


let objects = {
  a: {
    b: {
      c: {
        prize: 42
      }
    }
  }
}


let keys = {
  "a:b:c:prize": 42
}



console.time("Objects");
operations = 1000;
while(operations-- > 0) {
  let prize = objects.a.b.c.prize;
}
console.timeEnd("Objects");



console.time("Keys");
operations = 1000;
while(operations-- > 0) {
  let a = "a";
  let b = "b";
  let c = "c";
  let prizeKey = "prize";
  let prize = keys[a + b + c + prizeKey];  

  // Faster but cheating:
  // let key = "a:b:c:prize";
  // let prize = keys[key];  
}
console.timeEnd("Keys");


