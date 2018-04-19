let log = console.log;
let iterator = null;


function* getFromDb() {
	log("getFromDb");
	log("setting iterator");
	iterator = new Promise((resolve) => {
		setTimeout(() => { 
			log("getting the data");
			resolve(42) 
		}, 1);
	});
	yield 0;
}


let count = 10
function ordinaryCode() {
	log("ordinaryCode");
	while(count-- > 0) {
		log("...iterate...")
		getFromDb();
	}	
	// done = true;
}

log("getting generator");
let done = false;
function runPromise() {
	if (done) return;
	log("runPromise:");

	if (iterator === null) {
		setTimeout(runPromise, 0);
	} else {
		let state = iterator.next();
		let promise = state.value;
		if (!state.done) {
			// log("... recursive...");
			promise.then(runPromise)
		}		
	}
}

runPromise();
ordinaryCode();

setTimeout(()=>{ done = true }, 10)