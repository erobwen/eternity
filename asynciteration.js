// function resolveAfter2Seconds(x) { 
  // return new Promise(resolve => {
    // setTimeout(() => {
      // resolve(x);
    // }, 2000);
  // });
// }

// async function f1() {
  // var x = await resolveAfter2Seconds(10);
  // console.log(x); // 10
// }
// f1();


let log = console.log;


// Async database access
let database = [1, 2, 3, 5, ];
async function accessDatabase(id) {
	return new Promise(function(resolve) {
		setTimeout(() => { log("reading from database..."); resolve(database[id]) }, 7, 'foo');
	});	
}


// In and out data
let requests = [];
let results = [];

	
// Current result and past results
let request = null;
let result = null;
function processRequest() {
	if (request !== null) {
		let index = request.pop();
				
		accessDatabase(index).then((value) => {
			result.push(value);
			if (request.length === 0) {
				results.push(result);
				request = null;
				result = null;
			}
			processRequest();
		});
	}	
}


function processAnyRequests() {
	if (request === null && requests.length > 0) {
		// log("picking a new request!");
		request = requests.shift();
		result = []; 
		processRequest();
	}
}

// Main flush loop
function keepCheckingForRequests() {
	setTimeout(() => {
		processAnyRequests();
		keepCheckingForRequests(); 
	}, 0, 'foo');	
}

keepCheckingForRequests();


setTimeout(()=> {
	requests.push([0, 1, 2]);
}, 100, );


setTimeout(()=> {
	requests.push([1, 2]);
}, 500, );

setTimeout(() => {
	log(results);	
}, 1000);

