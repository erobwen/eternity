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


async function releaseControl() {
	return new Promise((resolve) => {
		setTimeout(() => {resolve()}, 0);
	}); 
}

// let releaseControl = new Promise((resolve) => {
	// setTimeout(() => {resolve()}, 0);
// }); 


// New request
let newRequest = false;
let request = null;

// Current result and past results
let result = null;
let results = [];



let processingRequest = false;
	// if (!processingRequest && request !== null) {
		// processingRequest = true;
		
		// let index = request.pop();
		// if (request.length === 0) request = null;
		
		// if (newRequest) {
			// newRequest = false;
			// result = [];
		// } 
		
		// accessDatabase(index).then((value) => {
			// result.push(value);
			// if (request === null) {
				// results.push(result);
				// result = null;
			// }
			// processingRequest = false;
			// processAnyRequests();
		// });
	// }




function processAnyRequests() {
}

async function keepCheckingForRequests() {
	while(true) {
		// log("iterating");
		if (request !== null) {
			// log("##########################");
			let index = request.pop();
			if (request.length === 0) request = null;
			
			if (newRequest) {
				newRequest = false;
				result = [];
			} 
			// log("a");
			let value = await accessDatabase(index);
			// log("b");

			result.push(value);
			
			if (request === null) {
				results.push(result);
				result = null;
			}
		}
		// log("trying to release");
		await releaseControl();
	}
}





setTimeout(()=> {
	newRequest = true;
	request = [0, 1, 2];
}, 100, );


setTimeout(()=> {
	newRequest = true;
	request = [1, 2];
}, 500, );

setTimeout(() => {
	log(results);	
}, 1000);


keepCheckingForRequests().then();
