
class Bar {
	function selectForFoo(selector) {
		selector.addArrayAndElements("propertyWithArray", "ForFoo");
		selector.add("a", "ForFoo");
		selector.
		
	}	
}

class BasicSelector {
	
}



class Selection {
	let currentObject = null;
	let nextPropertiesAndSelectors = {}
	
	addArrayAndElements() {}
	
	
}

function loadAndSelect(object, selector) {
	
	
	
}


{
	loadForEdit : {
		"b" : "Edit", 
		"[]" : "Edit",
		"c" : "Edit"
	}
}

liquid.addSubSelection(this.b, "Edit", selection);



	class Manager {
		loadAllSubjects : { "subjects[]" : "this"} // Load all elements of array subjects
		async teamSalaryCost() {
			return ensureLoaded(this, "AllSubjects", () => {
				let result = this.salary;
				this.subjects.forEach((subject) => {
					result += await subject.teamSalaryCost();
				});
				return result;
			});			
		}
	}


