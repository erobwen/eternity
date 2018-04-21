	let log = console.log;

	// Async database access
	let database = [1, 2, 3, 5, 9];
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

	// let releaseControl = new Promise((resolve) => { // Did not work for some reason... 
		// setTimeout(() => {resolve()}, 0);
	// }); 

	// Input and output
	let requests = [];
	let results = [];

		
	// Current process
	let result = null;
	let request = null;
	async function processRequest() {
		// Process existing request
		while (request !== null) {
			// log("processing a request one step!");
			let index = request.pop();
			
			let value = await accessDatabase(index);
			result.push(value);
			
			if (request.length === 0) {
				results.push(result);
				request = null;
				result = null;
			}
		}
	}

	async function checkForRequests() {
		// Start work on new request
		if (request === null && requests.length > 0) {
			// log("picking a new request!");
			request = requests.shift();
			result = [] 
			await processRequest();
		}
	}

	async function keepCheckingForRequests() {
		while(true) {
			await checkForRequests();

			// Release control
			await new Promise((resolve) => { setTimeout(() => {resolve()}, 0) });
			// await releaseControl();
		}
	}


	keepCheckingForRequests().then();

	setTimeout(()=> {
		requests.push([0, 1, 2]);
	}, 100, );


	setTimeout(()=> {
		requests.push([1, 2]);
	}, 500, );

	setTimeout(() => {
		log(results);	
	}, 1000);

// for (let file of files) {
