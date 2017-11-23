// Using UMD pattern: https://github.com/umdjs/umd
(function (root, factory) {
	if (typeof define === 'function' && define.amd) {
		define([], factory); // Support AMD
	} else if (typeof module === 'object' && module.exports) {
		module.exports = factory(); // Support NodeJS
	} else {
		root.causality = factory(); // Support browser global
	}
}(this, function () {	
	// Debugging
	let objectlog = require('./objectlog.js');
	let log = objectlog.log;
	let logGroup = objectlog.enter;
	let logUngroup = objectlog.exit;
	let trace = { basic : 0, incoming: 0}; 
	
	function createCausalityInstance(configuration) {
		// Class registry
		let classRegistry =  {};
		
		// State
		let state = { 
			inPulse : 0,
			inPostPulseProcess : 0,
			pulseEvents : [],
			
			causalityStack : [],
			writeRestriction : null,
			sideEffectBlockStack : [],
			context : null,
			microContext : null,
			nextIsMicroContext : false,
			contextsScheduledForPossibleDestruction : [],
			
			blockingInitialize : 0,
			
			incomingStructuresDisabled : configuration.useIncomingStructures ? 0 : 1,
			
			refreshingRepeater : false,
			refreshingAllDirtyRepeaters : false,
			
			cachedCallsCount : 0, // Mostly for testing... 
						
			inActiveRecording : false,
			activeRecording : null,
			
			emitEventPaused : 0,
			recordingPaused : 0,

			observerNotificationPostponed : 0, // This is used to make synchrounous change of incoming/outgoing references.
			observerNotificationNullified : 0
		};
		
		// Dynamic configuration (try to remove this for cleanness)
		let customCanWrite = null;
		
		function setCustomCanWrite(value) {
			customCanWrite = value;
		}
				 
		let customCanRead = null; 

		function setCustomCanRead(value) {
			customCanRead = value;
		}
		
		let postPulseHooks = [];
		
		function addPostPulseAction(callback) {
			postPulseHooks.push(callback);
		}


		/***************************************************************
		 *
		 *  Id format
		 *
		 ***************************************************************/
					

		const idExpressionPrefix = "_id_";
		const idExpressionSuffix = "_di_";

		function idExpression(id) {
			// log("idExpression: " + id);
			return idExpressionPrefix + id + idExpressionSuffix;
		}

		function transformPossibleIdExpression(string, idMapper) {
			if (isIdExpression(string)) {
				return transformIdExpression(string, idMapper);
			}
			return string;
		}
		
		function isIdExpression(string) {
			return string.startsWith(idExpressionPrefix);
		}


		function extractIdFromExpression(idExpression) {
			let withoutPrefix = idExpression.slice(idExpressionPrefix.length);
			let withoutOuter = withoutPrefix.substr(0, withoutPrefix.length - idExpressionSuffix.length);
			if (!isNaN(withoutOuter)) 
				return parseInt(withoutOuter);
			else 
				return null;
		}

		function transformIdExpression(idExpression, idMapper) {
			let withoutPrefix = idExpression.slice(idExpressionPrefix.length);
			let withoutOuter = withoutPrefix.substr(0, withoutPrefix.length - idExpressionSuffix.length);
			let splitOnPrefix = withoutOuter.split(idExpressionPrefix);
			if (splitOnPrefix.length === 1) {
				// A single id
				return idExpressionPrefix + idMapper(parseInt(splitOnPrefix[0])) + idExpressionSuffix;
			} else {
				let stringBuffer = [];
				// A multi id expression
				for (let i = 0; i < splitOnPrefix.length; i++) {
					let splitOnSuffix = splitOnPrefix[i].split(idExpressionSuffix);
					if (splitOnSuffix.length === 1) {
						// Just a starting blank, do nothing...
					} else if (splitOnSuffix.length === 2) {
						stringBuffer.push(idExpressionPrefix + idMapper(parseInt(splitOnSuffix[0])) + idExpressionSuffix + splitOnSuffix[1]);
					} else {
						// Id expression syntax error
						throw new Error("Id expression syntax error");
					}
				}
				return idExpressionPrefix + stringBuffer.join("") + idExpressionSuffix;
			}
		}

		
		/***************************************************************
		 *
		 *  Helpers
		 *
		 ***************************************************************/

		let argumentsToArray = function(arguments) {
			return Array.prototype.slice.call(arguments);
		};


		/***************************************************************
		 *
		 *  Specifiers
		 * 
		 * Specifiers has no id since they are never streamed independently of references. 
		 *
		 ***************************************************************/
		 
		 // TODO: Specifiers needs a reference to its causality object... 
		function getSpecifier(javascriptObject, specifierName) {
			if (typeof(javascriptObject[specifierName]) === 'undefined' || javascriptObject[specifierName] === null) {
				let specifier = {
					// Incoming structure
					isIncomingStructure : true,
					referredObject : javascriptObject, // should be object instead.... 
					referredObjectProperty : specifierName,
					parent : null,

					// Specifier
					isSpecifier : true,
					// name : "incomingStructure" // This fucked up things for incoming relations of name "name"
				}
				if (configuration.incomingStructuresAsCausalityObjects) specifier = createImmutable(specifier);
				javascriptObject[specifierName] = specifier;
			}
			return javascriptObject[specifierName];
		} 

		 
		/***************************************************************
		 *
		 *  Indicies
		 *
		 ***************************************************************/
		 		
		/**
		 * Traverse the index structure. TODO: This should perahps be used for all assignments.... ?
		 */
		let gottenReferingObject;
		let gottenReferingObjectRelation;
		function getReferingObject(possibleIndex, relationFromPossibleIndex) {
			gottenReferingObject = possibleIndex;
			gottenReferingObjectRelation = relationFromPossibleIndex;
			while (typeof(gottenReferingObject.indexParent) !== 'undefined') {
				gottenReferingObjectRelation = gottenReferingObject.indexParentRelation;
				gottenReferingObject = gottenReferingObject.indexParent;
			}
			
			return gottenReferingObject;
		}
		
		function setIndex(object, property, index) {
			state.incomingStructuresDisabled++;
			
			let previousValue = object[property];
			if (isObject(previousValue)) {
				delete previousValue.indexParent;
				delete previousValue.indexParentRelation;				
			}
			
			index.name = property;
			index.indexParent = object;
			index.indexParentRelation = property;
			object[property] = index;
			
			state.incomingStructuresDisabled--;
			return index;
		}
		 
		
		// Remove ? 
		// function isIndexParentOf(potentialParent, potentialIndex) {
			// if (!isObject(potentialParent) || !isObject(potentialIndex)) {  // what is actually an object, what 
			// // if (typeof(potentialParent) !== 'object' || typeof(potentialIndex) !== 'object') {
				// return false;
			// } else {
				// return (typeof(potentialIndex.indexParent) !== 'undefined') && potentialIndex.indexParent === potentialParent;
			// }
		// }
		
		function createReactiveArrayIndex(object, property) {
			let index = [];
			if (configuration.reactiveStructuresAsCausalityObjects) index = createImmutable(index);

			index.indexParent = object;
			index.indexParentRelation = property;

			object[property] = index;
			return index;
		}
		
		
		function createArrayIndex(object, property) {
			state.incomingStructuresDisabled++;
			
			let index = create([]);
			index.indexParent = object;
			index.indexParentRelation = property;
			object[property] = index;
			
			state.incomingStructuresDisabled--;
			return index;
		}
		

		function createObjectIndex(object, property) {
			state.incomingStructuresDisabled++;
			
			let index = create({});
			index.indexParent = object;
			index.indexParentRelation = property;
			object[property] = index;

			state.incomingStructuresDisabled--;
			return index;
		}

		
		/***************************************************************
		 *
		 *  Incoming properties 
		 *
		 ***************************************************************/
		 
		function isIncomingStructure(entity) {
			return typeof(entity) === 'object' && entity !== null && typeof(entity.isIncomingStructure) !== 'undefined';
		} 
		 
		/**
		 * Traverse the incoming relation structure foobar
		 */
		function getReferredObject(referredItem) {
			if (typeof(referredItem) === 'object' && referredItem !== null) {
				if (typeof(referredItem.referredObject) !== 'undefined' && typeof(referredItem.isSpecifier) === 'undefined') {
					return referredItem.referredObject;
				} else {
					return referredItem;
				}
			}
			return referredItem;
		}
		
		
		function getReferredObjects(array) {
			let newArray = [];
			array.forEach(function(objectOrIncomingStructure) {
				newArray.push(getReferredObject(objectOrIncomingStructure));
			})
			return newArray;
		}
		
		function getSingleIncomingReference(object, property, filter) {
			trace.incoming && log("getSingleIncomingReference");
			let result = null;
			forAllIncoming(object, property, function(foundObject) {
				if (result === null) {
					result = foundObject;
				} else {
					throw new Error("Unexpected: More than one incoming reference for property: " + property);
				}
			}, filter);
			return result;
		}
		
		function getIncomingReferences(object, property, filter) {
			// log(trace)
			trace.incoming && log("getIncomingReferences");
			if (typeof(object) === 'undefined') {
				throw new Error("No object given to 'getIncomingReferences'");
			}
			let result = [];
			forAllIncoming(object, property, function(foundObject) {
				result.push(foundObject);
			}, filter);
			return result;
		}
		
		function getIncomingReferencesMap(object, property, filter) {	
			let result = {};
			forAllIncoming(object, property, function(object) {
				result[idExpression(object.const.id)] = object;
			}, filter);
			return result;
		}
		
		function forAllIncoming(object, property, callback, filter) {
			if(trace.incoming) log("forAllIncoming");
			if(trace.incoming) log(object.const.incoming, 2);
			if (state.inActiveRecording) registerAnyChangeObserver(getSpecifier(getSpecifier(getSpecifier(object.const, "incoming"), "property:" + property), "observers"));
			withoutRecording(function() { // This is needed for setups where incoming structures are made out of causality objects. 
				if (typeof(object.const.incoming) !== 'undefined') {
					if(trace.incoming) log("incoming exists!");
					let relations = object.const.incoming;
					let propertyKey = "property:" + property;
					if (typeof(relations[propertyKey]) !== 'undefined') {
						trace.incoming && log("property exists");
						let relation = relations[propertyKey];
						if (relation.initialized === true) {							
							let contents = relation.contents;
							for (id in contents) {
								let referer = contents[id];
								callback(referer);
							}
							let currentChunk = relation.first
							while (currentChunk !== null) {
								let contents = currentChunk.contents;
								for (id in contents) {
									let referer = contents[id];
									if (typeof(filter) === 'undefined' || filter(referer)) {
										callback(referer);									
									}
								}
								currentChunk = currentChunk.next;
							}
						}
					}
				}
			});
		}
		
		// TODO: 
		// Cannot do this unless we have a neat way to iterate over all incoming relations.
		// Right now the structure is: { referredObject: referencedObject, last: null, first: null };
		// function forEveryIncoming(object, callback, filter) {
			// ...
		// }

		// function hasIncomingRelationArray(array, index) { // Maybe not needed???
			// state.incomingStructuresDisabled++;
			// let result = array[index];
			// if (typeof(result.isIncomingPropertyStructure)) {
				// return true;
			// } else {
				// // Check if there is an internal incoming relation.
			// }
			// return false;
			// state.incomingStructuresDisabled--;			
		// }
		
		// function hasIncomingRelation(object, property) {
			// state.incomingStructuresDisabled++;
			// let result = object[property];
			// if (typeof(result.isIncomingPropertyStructure)) {
				// return true;
			// } else {
				// // Check if there is an internal incoming relation.
			// }
			// return false;
			// state.incomingStructuresDisabled--;			
		// }

		function disableIncomingRelations(action) {
			state.inPulse++;
			state.incomingStructuresDisabled++;
			action();
			state.incomingStructuresDisabled--;
			if(--state.inPulse === 0) postPulseCleanup();
		}
		
		let removedLastIncomingRelationCallback = null;
		function removedLastIncomingRelation(object) {
			if (removedLastIncomingRelationCallback !== null) {
				removedLastIncomingRelationCallback(object);
			}
		}
		
		function addRemovedLastIncomingRelationCallback(callback) {
			removedLastIncomingRelationCallback = callback;
		}
		
		
		/*-----------------------------------------------
		 *            Incoming structures
		 *-----------------------------------------------*/
		
		
		function createAndRemoveIncomingRelations(objectProxy, key, value, previousValue, previousStructure) {
			// Note: sometimes value and previous value are just strings. Optimize for this case... 
			let referringRelation = key;
			if (trace.incoming) {
				log("createAndRemoveIncomingRelations");
				log(referringRelation);
				log(objectProxy);
			}
			
			// Get refering object 
			while (typeof(objectProxy.indexParent) !==  'undefined') {
				referringRelation = objectProxy.indexParentRelation;
				objectProxy = objectProxy.indexParent;				
				if (trace.incoming) {
					log("Moving up one step:");
					log(referringRelation);
					log(objectProxy);
				}
			}
			referringRelation = "property:" + referringRelation;
			
			// Tear down structure to old value
			if (isReferencesChunk(previousStructure)) {
				if (trace.incoming) log("tear down previous incoming... ");
				if (configuration.blockInitializeForIncomingStructures) state.blockingInitialize++;
				removeReverseReference(objectProxy.const.id, previousStructure);
				if (previousValue.const.incoming && previousValue.const.incoming[referringRelation]&& previousValue.const.incoming[referringRelation].observers) {
					notifyChangeObservers(previousValue.const.incoming[referringRelation]);
				}
				if (configuration.blockInitializeForIncomingStructures) state.blockingInitialize--;
			}

			// Setup structure to new value
			if (isObject(value)) {
				if (trace.basic) log("really creating incoming structure");
				
				let referencedValue = createAndAddReverseReferenceToIncomingStructure(objectProxy, objectProxy.const.id, referringRelation, value);
				if (trace.basic) log(referringRelation);
				if (trace.basic) log(value.const.incoming);
				
				if (value.const.incoming && value.const.incoming[referringRelation].observers) {
					notifyChangeObservers(value.const.incoming[referringRelation].observers);
				}
				value = referencedValue;
			}

			return value;
		}
		
		function removeIncomingRelation(objectProxy, key, removedValue, previousStructure) {
			// Get refering object 
			let referringRelation = key;
			while (typeof(objectProxy.indexParent) !==  'undefined') {
				referringRelation = objectProxy.indexParentRelation;
				objectProxy = objectProxy.indexParent;
			}
			referringRelation = "property:" + referringRelation;
			
			// Tear down structure to old value
			if (isObject(removedValue) && isIncomingStructure(previousStructure)) {
				if (configuration.blockInitializeForIncomingStructures) state.blockingInitialize++;
				removeReverseReference(objectProxy.const.id, previousStructure);
				if (removedValue.const && removedValue.const.incoming && removedValue.const.incoming[referringRelation].observers) {
					notifyChangeObservers(removedValue.const.incoming[referringRelation].observers);
				}
				if (configuration.blockInitializeForIncomingStructures) state.blockingInitialize--;
			}
		}
		
		function createAndRemoveArrayIncomingRelations(arrayProxy, index, removedOrIncomingStructures, added) {
			// Get refering object 
			// log("createAndRemoveArrayIncomingRelations");
			// logGroup();
			let referringRelation = "[]";
			while (typeof(arrayProxy.indexParent) !==  'undefined') {
				referringRelation = arrayProxy.indexParentRelation;
				arrayProxy = arrayProxy.indexParent;
			}
			referringRelation = "property:" + referringRelation;
			
			// Create incoming relations for added
			let addedAdjusted = [];
			added.forEach(function(addedElement) {
				if (isObject(addedElement)) {
					addedElement.const.incomingReferences++; // TODO: Move elsewhere... 
					// log("added element is object");
					let referencedValue = createAndAddReverseReferenceToIncomingStructure(arrayProxy, arrayProxy.const.id, referringRelation, addedElement);
					if (typeof(addedElement.const.incoming[referringRelation].observers) !== 'undefined') {
						notifyChangeObservers(addedElement.const.incoming[referringRelation].observers);
					}
					addedAdjusted.push(referencedValue);
				} else {
					addedAdjusted.push(addedElement);
				}						
			});
			
			// Remove incoming relations for removed
			if (removedOrIncomingStructures !== null) {
				removedOrIncomingStructures.forEach(function(removedOrIncomingStructure) {
					if (isIncomingStructure(previousStructure)) {
						if ((previousValue.const.incomingReferences -= 1) === 0)  removedLastIncomingRelation(removedElement); // TODO: Move elsewhere... 
						removeReverseReference(proxy.const.id, removedOrIncomingStructure);
						if (typeof(removedOrIncomingStructure.const.incoming[referringRelation].observers) !== 'undefined') {
							notifyChangeObservers(removedOrIncomingStructure.const.incoming[referringRelation].observers);
						}
					}					
				});					
			}
			// logUngroup();
			return addedAdjusted;
		} 
		
		
		
		function createAndAddReverseReferenceToIncomingStructure(referingObject, referingObjectId, propertyKey, object) {
			trace.incoming && log("createAndAddReverseReferenceToIncomingStructure");
			let incomingStructure = getIncomingPropertyStructure(object, propertyKey);

			let incomingRelationChunk = intitializeAsReverseReferencesChunkListThenAddIfNeeded(incomingStructure, referingObject, referingObjectId);
			if (incomingRelationChunk !== null) {
				return incomingRelationChunk;
			} else {
				return object; // TODO:  this will return if already added in root? not a problem because of refusal to set same value twice?
			}
		} 
		
		
		function getIncomingPropertyStructure(referencedObject, propertyKey) {
			trace.incoming && log("getIncomingPropertyStructure");
			
			// Create incoming structure
			let incomingPropertiesStructure;
			if (typeof(referencedObject.const.incoming) === 'undefined') {
				incomingPropertiesStructure = {
					isIncomingStructure : true, 
					referredObject: referencedObject,
					
					isIncomingStructureRoot : true,
					propertyInRoot : 'incoming',
					
					isList : true,
					last: null, 
					first: null };
				if (configuration.incomingStructuresAsCausalityObjects) {
					incomingPropertiesStructure = create(incomingPropertiesStructure);
				}
				referencedObject.const.incoming = incomingPropertiesStructure;
			} else {
				incomingPropertiesStructure = referencedObject.const.incoming;
			}
			
			// Create incoming for this particular property
			if (trace.incoming) {
				log(incomingPropertiesStructure);
				log(propertyKey);
				log(incomingPropertiesStructure[propertyKey]);
			}
			if (typeof(incomingPropertiesStructure[propertyKey]) === 'undefined') {
				let incomingStructure = { 
					isIncomingStructure : true, 
					referredObject: referencedObject,
					
					// Is list element
					isListElement : true,
					parent : incomingPropertiesStructure,
					next: null, 
					previous: incomingPropertiesStructure.last 
				};
				if (incomingPropertiesStructure.first === null) {
					incomingPropertiesStructure.first = incomingStructure;
					incomingPropertiesStructure.last = incomingStructure;
				} else {					
					incomingPropertiesStructure.last.next = incomingStructure;
					incomingPropertiesStructure.last = incomingStructure;
				}
				
				if (configuration.incomingStructuresAsCausalityObjects) {
					// Disable incoming relations here? otherwise we might end up with incoming structures between 
					incomingStructure = create(incomingStructure);
					if (incomingStructure.propertyKey === "property:indexParent") {
						throw new Error("What is this, should not have incoming structure for indexParent....");
					}
					// log("CREATED INCOMING STRUCTURE THAT IS AN OBJECT");
					// log(incomingStructure);
				}
				incomingPropertiesStructure[propertyKey] = incomingStructure;
			}
			
			return incomingPropertiesStructure[propertyKey];
		}
		
		
		/**************************************************************
		 *
		 *  Reverse references chunk list
		 *
		 ***************************************************************/
		
		function isReferencesChunk(entity) {
			return typeof(entity) === 'object' && entity !== null && typeof(entity.isReferencesChunk) !== 'undefined';
		}
		
		function tryRemoveIncomingStructure(structure) {
			if (typeof(structure.contentsCounter) === 'undefined' || structure.contentsCounter === 0) {
				if (typeof(structure.removedCallback) !== 'undefined') { // referencesChunk.removedCallback this is probably wrong!
					structure.removedCallback();
				}
				
				if (typeof(structure.isListElement) !== 'undefined') {
					if (structure.parent.first === structure) {
						structure.parent.first === structure.next;
					}
					if (structure.parent.last === structure) {
						structure.parent.last === structure.previous;
					}
					if (structure.next !== null) {
						structure.next.previous = structure.previous;
					}
					if (structure.previous !== null) {
						structure.previous.next = structure.next;
					}
					structure.next = null;
					structure.previous = null;
					
					if (structure.parent.first === null && structure.parent.last === null) {
						tryRemoveIncomingStructure(structure.parent);						
					}
				}
			}
		}
	
		// /**
		// * Structure helpers
		// */				
		// function removeReverseReference(refererId, referencesChunk) {
			// if (trace.incoming) {
				// log("removeReverseReference");
				// log(refererId);
				// log(referencesChunk, 3);
			// }
			// let referencesChunkContents = referencesChunk['contents'];
			// delete referencesChunkContents[idExpression(refererId)];
			// referencesChunk.contentsCounter--;
			// tryRemoveIncomingStructure(referencesChunk);
		// }
		
		/**
		* Structure helpers
		*/				
		function removeReverseReference(refererId, referencesChunk) {
			if (trace.incoming) {
				log("removeReverseReference");
				log(refererId);
				// log(chunkList, 3);
			}
			// if (typeof(chunkList.isIncomingPropertyStructure) !== 'undefined') {
				// let referencesChunk = chunkList;
				let referencesChunkContents = referencesChunk['contents'];
				delete referencesChunkContents[idExpression(refererId)];
				let noMoreObservers = false;
				referencesChunk.contentsCounter--;
				if (referencesChunk.contentsCounter == 0) {
					if (typeof(referencesChunk.isChunkListHead) !== 'undefined') {
						if (referencesChunk.first === null && referencesChunk.last === null) {
							noMoreObservers = true;
						}
					} else {
						if (referencesChunk.parent.first === referencesChunk) {
							referencesChunk.parent.first === referencesChunk.next;
						}

						if (referencesChunk.parent.last === referencesChunk) {
							referencesChunk.parent.last === referencesChunk.previous;
						}

						if (referencesChunk.next !== null) {
							referencesChunk.next.previous = referencesChunk.previous;
						}

						if (referencesChunk.previous !== null) {
							referencesChunk.previous.next = referencesChunk.next;
						}

						if (configuration.incomingChunkRemovedCallback !== null) {
							configuration.incomingChunkRemovedCallback(referencesChunk);
						}
						referencesChunk.previous = null;
						referencesChunk.next = null;

						let root = referencesChunk.parent;
						if (root.first === null && root.last === null && root.contentsCounter === 0) {
							noMoreObservers = true;
						}
					}

					if (noMoreObservers && typeof(referencesChunk.removedCallback) !== 'undefined') {
						referencesChunk.removedCallback();
					}
				}
			// }
		}
		
		function intitializeAsReverseReferencesChunkListThenAddIfNeeded(incomingStructure, referingObject, referingObjectId) {
			let refererId = idExpression(referingObjectId);
			// console.log("intitializeAsReverseReferencesChunkListThenAddIfNeeded:");
			// console.log(referingObject);

			
			// console.log(activeRecorder);
			if (typeof(incomingStructure.initialized) === 'undefined') {
				incomingStructure.isChunkListHead = true;
				// incomingStructure.contents = { name: "contents" };
				
				incomingStructure.isReferencesChunk = true;
				incomingStructure.contents = {};
				incomingStructure.contentsCounter = 0;
				incomingStructure.initialized = true;
				
				incomingStructure.isList = true;
				incomingStructure.first = null;
				incomingStructure.last = null;
				
				if (configuration.incomingStructuresAsCausalityObjects) {
					incomingStructure.contents = create(incomingStructure.contents);
				}
			}

			// Already added in the root
			if (typeof(incomingStructure.contents[refererId]) !== 'undefined') {
				return null;
			}
			
			let finalIncomingStructure;			
			if (incomingStructure.contentsCounter === configuration.incomingStructureChunkSize) {
				// Root node is full
				// log("Root node is full...")
				
				// Move on to new chunk?
				if (incomingStructure.last !== null && incomingStructure.contentsCounter !== configuration.incomingStructureChunkSize) {
					// There is a non-full last chunk.
					finalIncomingStructure = incomingStructure.last;
				} else {
					// Last chunk is either full or nonexistent....
					// log("newChunk!!!");
					let newChunk = {
						isIncomingStructure : true,
						referredObject : incomingStructure.referredObject,
						
						isReferencesChunk : true,
						contents : {},
						contentsCounter : 0,
						
						isListElement : true, 
						next : null,
						previous : null,
						parent : null
					};
					if (configuration.incomingStructuresAsCausalityObjects) {
						newChunk.contents = create(newChunk.contents);
						newChunk = create(newChunk);
					}
					if (incomingStructure.first === null) {
						// log("creting a lonley child...");
						newChunk.parent = incomingStructure;
						incomingStructure.first = newChunk;
						incomingStructure.last = newChunk;
					} else {
						// log("appending sibling...");
						let last = incomingStructure.last;
						last.next = newChunk;
						newChunk.previous = last;
						newChunk.parent = incomingStructure;
						incomingStructure.last = newChunk;
					}
					finalIncomingStructure = newChunk;
				}
				
			} else {
				finalIncomingStructure = incomingStructure;
			}

			// Add repeater on object beeing observed, if not already added before
			let incomingStructureContents = finalIncomingStructure.contents;
			if (typeof(incomingStructureContents[refererId]) === 'undefined') {
				// log("here increasing counter... ");
				finalIncomingStructure.contentsCounter = finalIncomingStructure.contentsCounter + 1;
				incomingStructureContents[refererId] = referingObject;

				// Note dependency in repeater itself (for cleaning up)
				// activeRecorder.sources.push(incomingStructure);
				return finalIncomingStructure;
			} else {
				return null;
			}
		}
					

		/***************************************************************
		 *
		 *  Incoming counters
		 *
		 ***************************************************************/

		
		function increaseIncomingCounter(value) {
			if (configuration.blockInitializeForIncomingReferenceCounters) state.blockingInitialize++;
			if (isObject(value)) {				
				if (value.const.incomingReferencesCount < 0) {
					log(value.const.incomingReferencesCount);
					throw Error("WTAF");
				} 
				if (typeof(value.const.incomingReferencesCount) === 'undefined') {
					value.const.incomingReferencesCount = 0;
				}
				value.const.incomingReferencesCount++;
			}
			if (configuration.blockInitializeForIncomingReferenceCounters) state.blockingInitialize--;
		}
		
		function decreaseIncomingCounter(value) {
			if (configuration.blockInitializeForIncomingReferenceCounters) state.blockingInitialize++;
			if (isObject(value)) {
				value.const.incomingReferencesCount--;
				if (value.const.incomingReferencesCount < 0) {
					console.log(value);
					throw Error("WTAF");					
				}
				if (value.const.incomingReferencesCount === 0) {
					removedLastIncomingRelation(value);
				}
			}
			if (configuration.blockInitializeForIncomingReferenceCounters) state.blockingInitialize--;
		}
		
		
		/***************************************************************
		 *
		 *  Array const
		 *
		 ***************************************************************/
		 
		
		let constArrayOverrides = {
			pop : function() {
				if (!canWrite(this.const.object)) return;
				state.inPulse++;
				state.observerNotificationPostponed++;

				let index = this.target.length - 1;
				// state.observerNotificationNullified++;
				let removedOrIncomingStructure = this.target.pop();
				let removed;
				// state.observerNotificationNullified--;
				
				if (state.incomingStructuresDisabled === 0) {
					removed = getReferredObject(removedOrIncomingStructure);
					state.incomingStructuresDisabled++;
					createAndRemoveIncomingRelations(this.const.object, null, null, removed, removedOrIncomingStructure);
					state.incomingStructuresDisabled--;
				}
				
				if (typeof(this.const._arrayObservers) !== 'undefined') {
					notifyChangeObservers(this.const._arrayObservers);
				}
				if (state.incomingStructuresDisabled === 0 && !configuration.incomingStructuresAsCausalityObjects) {
					emitSpliceEvent(this, index, [removed], null);					
				} else {
					emitSpliceEvent(this, index, [removedOrIncomingStructure], null);					
				}
				if (--state.observerNotificationPostponed === 0) proceedWithPostponedNotifications();
				if (--state.inPulse === 0) postPulseCleanup();
				return (state.incomingStructuresDisabled === 0 && !configuration.incomingStructuresAsCausalityObjects) ? removed : removedOrIncomingStructure;
			},

			push : function() {
				if (!canWrite(this.const.object)) return;
				state.inPulse++;
				state.observerNotificationPostponed++;

				let index = this.target.length;
				let argumentsArray = argumentsToArray(arguments);
				
				let added = argumentsArray;
				let addedOrIncomingStructures; 
				
				// TODO: configuration.incomingReferenceCounters || .... 
				if (state.incomingStructuresDisabled === 0) {
					state.incomingStructuresDisabled++;
					addedOrIncomingStructures = createAndRemoveArrayIncomingRelations(this.const.object, index, null, added); // TODO: implement for other array manipulators as well. 
					state.incomingStructuresDisabled--;
					this.target.push.apply(this.target, addedOrIncomingStructures);
				} else {
					this.target.push.apply(this.target, added);
				}
				
				// Notify and emit event
				if (typeof(this.const._arrayObservers) !== 'undefined') {
					notifyChangeObservers(this.const._arrayObservers);
				}
				if (state.incomingStructuresDisabled === 0 && configuration.incomingStructuresAsCausalityObjects) {
					emitSpliceEvent(this, index, null, addedOrIncomingStructures);
				} else {
					emitSpliceEvent(this, index, null, added);
				}
				
				if (--state.observerNotificationPostponed === 0) proceedWithPostponedNotifications();
				if (--state.inPulse === 0) postPulseCleanup();
				// logUngroup();
				return this.target.length;
			},

			shift : function() {
				if (!canWrite(this.const.object)) return;
				state.inPulse++;
				state.observerNotificationPostponed++;
				
				let removedOrIncomingStructure = this.target.shift();
				let removed;
				if (state.incomingStructuresDisabled === 0) {
					removed = getReferredObject(removedOrIncomingStructure);
					state.incomingStructuresDisabled++;
					createAndRemoveIncomingRelations(this.const.object, null, null, removed, removedOrIncomingStructure);
					state.incomingStructuresDisabled--;
				}
				
				// Notify and emit event
				if (typeof(this.const._arrayObservers) !== 'undefined') {
					notifyChangeObservers(this.const._arrayObservers);
				}
				if (state.incomingStructuresDisabled === 0 && !configuration.incomingStructuresAsCausalityObjects) {
					emitSpliceEvent(this, 0, [removed], null);
				} else {
					emitSpliceEvent(this, 0, [removedOrIncomingStructure], null);
				}
				
				if (--state.observerNotificationPostponed === 0) proceedWithPostponedNotifications();
				if (--state.inPulse === 0) postPulseCleanup();
				return (state.incomingStructuresDisabled === 0 && !configuration.incomingStructuresAsCausalityObjects) ? removed : removedOrIncomingStructure;
			},

			unshift : function() {
				if (!canWrite(this.const.object)) return;
				state.inPulse++;
				state.observerNotificationPostponed++;

				let added = argumentsToArray(arguments);
				let addedOrIncomingStructures;
				
				if (state.incomingStructuresDisabled === 0) {
					state.incomingStructuresDisabled++;
					addedOrIncomingStructures = createAndRemoveArrayIncomingRelations(this.const.object, 0, null, added); // TODO: implement for other array manipulators as well. 
					state.incomingStructuresDisabled--;
					this.target.unshift.apply(this.target, addedOrIncomingStructures);
				} else {
					this.target.unshift.apply(this.target, added);
				}
				
				// Notify and emit event
				if (typeof(this.const._arrayObservers) !== 'undefined') {
					notifyChangeObservers(this.const._arrayObservers);
				}				
				if (state.incomingStructuresDisabled === 0 && configuration.incomingStructuresAsCausalityObjects) {
					emitSpliceEvent(this, 0, null, addedOrIncomingStructures);
				} else {
					emitSpliceEvent(this, 0, null, added);
				}
				
				if (--state.observerNotificationPostponed === 0) proceedWithPostponedNotifications();
				if (--state.inPulse === 0) postPulseCleanup();
				return this.target.length;
			},
			
			splice : function() {
				if (!canWrite(this.const.object)) return;
				state.inPulse++;
				state.observerNotificationPostponed++;

				let argumentsArray = argumentsToArray(arguments);
				let index = argumentsArray[0];
				let removedCount = argumentsArray[1];
				if( typeof argumentsArray[1] === 'undefined' )
					removedCount = this.target.length - index;
				let added = argumentsArray.slice(2);
				let removedOrIncomingStructures;
				let removed; 

				if (state.incomingStructuresDisabled === 0) {
					removedOrIncomingStructures = this.target.slice(index, removedCount);
					state.incomingStructuresDisabled++;
					addedOrIncomingStructures = createAndRemoveArrayIncomingRelations(this.const.object, index, removedOrIncomingStructures, added);
					state.incomingStructuresDisabled--;
					let i = 2;
					addedOrIncomingStructures.forEach(function(addedOrIncomingStructure) {
						argumentsArray[i++] = addedOrIncomingStructure; 
					})
					result = this.target.splice.apply(this.target, argumentsArray);
					removed = getReferredObjects(removedOrIncomingStructures);
				} else {
					removedOrIncomingStructures = this.target.splice.apply(this.target, argumentsArray);
				}

				if (typeof(this.const._arrayObservers) !== 'undefined') {
					notifyChangeObservers(this.const._arrayObservers);
				}
				if (state.incomingStructuresDisabled === 0) {
					if (configuration.incomingStructuresAsCausalityObjects) {
						emitSpliceEvent(this, 0, removedOrIncomingStructures, addedOrIncomingStructures);
					} else {
						emitSpliceEvent(this, 0, removed, added);
					}
				} else {
					// emitSpliceEvent(this, 0, null, added);
					emitSpliceEvent(this, index, removedOrIncomingStructures, added);
				}
				
				if (--state.observerNotificationPostponed === 0) proceedWithPostponedNotifications();
				if (--state.inPulse === 0) postPulseCleanup();
				return (state.incomingStructuresDisabled === 0 && !configuration.incomingStructuresAsCausalityObjects) ? removed : removedOrIncomingStructures; // equivalent to removed
			},
			// splice : function() {
				// if (!canWrite(this.const.object)) return;
				// state.inPulse++;
				// 

				// let argumentsArray = argumentsToArray(arguments);
				// let index = argumentsArray[0];
				// let removedCount = argumentsArray[1];
				// if( typeof argumentsArray[1] === 'undefined' )
					// removedCount = this.target.length - index;
				// let added = argumentsArray.slice(2);
				// let addedOrIncomingStructures;
				
				// let removedOrIncomingStructures = this.target.slice(index, index + removedCount);
				// let removed;
				// let result;
				// if (state.incomingStructuresDisabled === 0) {
					// state.incomingStructuresDisabled++;
					// addedOrIncomingStructures = createAndRemoveArrayIncomingRelations(this.const.object, index, removedOrIncomingStructures, added);
					// state.incomingStructuresDisabled--;
					// let i = 2;
					// added.forEach(function(addedOrIncomingStructure) {
						// argumentsArray[i++] = addedOrIncomingStructure; 
					// })
					// result = this.target.splice.apply(this.target, argumentsArray);
					// result = getReferredObjects(result);
				// } else {
					// result = this.target.splice.apply(this.target, argumentsArray);
				// }
				
				// // Notify and emit event
				// if (typeof(this.const._arrayObservers) !== 'undefined') {
					// notifyChangeObservers(this.const._arrayObservers);
				// }
				// if (state.incomingStructuresDisabled === 0 && !configuration.incomingStructuresAsCausalityObjects) {
					// emitSpliceEvent(this, 0, removed);
				// } else {
					// emitSpliceEvent(this, 0, removedOrIncomingStructures);											
				// }
				
				// 
				// if (--state.inPulse === 0) postPulseCleanup();
				// return result; // equivalent to removed
			// },

			copyWithin: function(target, start, end) {
				if (state.incomingStructuresDisabled === 0) throw new Error("Not supported yet!");
				if (!canWrite(this.const.object)) return;
				state.inPulse++;
				

				if (target < 0) { start = this.target.length - target; }
				if (start < 0) { start = this.target.length - start; }
				if (end < 0) { start = this.target.length - end; }
				end = Math.min(end, this.target.length);
				start = Math.min(start, this.target.length);
				if (start >= end) {
					return;
				}
				let removed = this.target.slice(index, index + end - start);
				let added = this.target.slice(start, end);

				state.observerNotificationNullified++;
				let result = this.target.copyWithin(target, start, end);
				state.observerNotificationNullified--;
				if (typeof(this.const._arrayObservers) !== 'undefined') {
					notifyChangeObservers(this.const._arrayObservers);
				}

				emitSpliceEvent(this, target, added, removed);
				if (--state.inPulse === 0) postPulseCleanup();
				return result;
			}
		};

		['reverse', 'sort', 'fill'].forEach(function(functionName) {
			constArrayOverrides[functionName] = function() {
				if (state.incomingStructuresDisabled === 0) throw new Error("Not supported yet!");
				if (!canWrite(this.const.object)) return;
				state.inPulse++;

				let argumentsArray = argumentsToArray(arguments);
				let removed = this.target.slice(0);

				state.observerNotificationNullified++;
				let result = this.target[functionName].apply(this.target, argumentsArray);
				state.observerNotificationNullified--;
				if (typeof(this.const._arrayObservers) !== 'undefined') {
					notifyChangeObservers(this.const._arrayObservers);
				}
				emitSpliceEvent(this, 0, removed, this.target.slice(0));
				if (--state.inPulse === 0) postPulseCleanup();
				return result;
			};
		});


		/***************************************************************
		 *
		 *  Array Handlers
		 *
		 ***************************************************************/
		
		function getHandlerArray(target, key) {
			if (this.const.forwardsTo !== null && key !== 'nonForwardConst') { // && (typeof(overlayBypass[key]) === 'undefined')
				// console.log(this.const.forwardsTo);
				let overlayHandler = this.const.forwardsTo.const.handler;
				return overlayHandler.get.apply(overlayHandler, [overlayHandler.target, key]);
			}
			ensureInitialized(this, target);
			// if (state.incomingStructuresDisabled === 0) throw new Error("Not supported yet!");
			
			if (key === "const" || key === "nonForwardConst") {
				return this.const;
			} else if (constArrayOverrides[key]) {
				return constArrayOverrides[key].bind(this);
			} else {
				if (state.inActiveRecording) {
					registerChangeObserver(getSpecifier(this.const, "_arrayObservers"));//object
				}
				return target[key];
			}
		}

		function setHandlerArray(target, key, value) {
			if (this.const.forwardsTo !== null) {
				if (key === "forwardsTo") {
					this.const.forwardsTo = value; // Access const directly?
					return true;
				} else {
					let overlayHandler = this.const.forwardsTo.const.handler;
					return overlayHandler.set.apply(overlayHandler, [overlayHandler.target, key, value]);
				}
			}

			ensureInitialized(this, target);
			// if (state.incomingStructuresDisabled === 0) throw new Error("Not supported yet!");

			let previousValue = target[key];

			// If same value as already set, do nothing.
			if (key in target) {
				if (previousValue === value || (Number.isNaN(previousValue) && Number.isNaN(value)) ) {
					return true;
				}
			}
			
			// Start pulse if can write
			if (!canWrite(this.const.object)) return;
			state.inPulse++;
			state.observerNotificationPostponed++; // TODO: Do this for backwards references from arrays as well...


			if (!isNaN(key)) {
				// Number index
				if (typeof(key) === 'string') {
					key = parseInt(key);
				}
				target[key] = value;
				if( target[key] === value || (Number.isNaN(target[key]) && Number.isNaN(value)) ) { // Write protected?
					emitSpliceReplaceEvent(this, key, value, previousValue);
					if (typeof(this.const._arrayObservers) !== 'undefined') {
						notifyChangeObservers(this.const._arrayObservers);
					}
				}
			} else {
				// String index
				target[key] = value;
				if( target[key] === value || (Number.isNaN(target[key]) && Number.isNaN(value)) ) { // Write protected?
					emitSetEvent(this, key, value, previousValue);
					if (typeof(this.const._arrayObservers) !== 'undefined') {
						notifyChangeObservers(this.const._arrayObservers);
					}
				}
			}

			state.observerNotificationPostponed--;
			proceedWithPostponedNotifications();
			if (--state.inPulse === 0) postPulseCleanup();

			if( target[key] !== value && !(Number.isNaN(target[key]) && Number.isNaN(value)) ) return false; // Write protected?
			return true;
		}

		function deletePropertyHandlerArray(target, key) {
			if (this.const.forwardsTo !== null) {
				let overlayHandler = this.const.forwardsTo.const.handler;
				return overlayHandler.deleteProperty.apply(overlayHandler, [overlayHandler.target, key]);
			}
			if (!(key in target)) {
				return true;
			}
			if (!canWrite(this.const.object)) return true;
			
			ensureInitialized(this, target);
			// if (state.incomingStructuresDisabled === 0) throw new Error("Not supported yet!");
			
			state.inPulse++;

			let previousValue = target[key];
			delete target[key];
			if(!( key in target )) { // Write protected?
				emitDeleteEvent(this, key, previousValue);
				if (typeof(this.const._arrayObservers) !== 'undefined') {
					notifyChangeObservers(this.const._arrayObservers);
				}
			}
			if (--state.inPulse === 0) postPulseCleanup();
			if( key in target ) return false; // Write protected?
			return true;
		}

		function ownKeysHandlerArray(target) {
			if (this.const.forwardsTo !== null) {
				let overlayHandler = this.const.forwardsTo.const.handler;
				return overlayHandler.ownKeys.apply(overlayHandler, [overlayHandler.target]);
			}

			ensureInitialized(this, target);
			// if (state.incomingStructuresDisabled === 0) throw new Error("Not supported yet!");

			if (state.inActiveRecording) {
				registerChangeObserver(getSpecifier(this.const, "_arrayObservers"));
			}
			let result   = Object.keys(target);
			result.push('length');
			return result;
		}

		function hasHandlerArray(target, key) {
			if (this.const.forwardsTo !== null) {
				let overlayHandler = this.const.forwardsTo.const.handler;
				return overlayHandler.has.apply(overlayHandler, [target, key]);
			}
			
			ensureInitialized(this, target);
			// if (state.incomingStructuresDisabled === 0) throw new Error("Not supported yet!");

			if (state.inActiveRecording) {
				registerChangeObserver(getSpecifier(this.const, "_arrayObservers"));
			}
			return key in target;
		}

		function definePropertyHandlerArray(target, key, oDesc) {
			if (this.const.forwardsTo !== null) {
				let overlayHandler = this.const.forwardsTo.const.handler;
				return overlayHandler.defineProperty.apply(overlayHandler, [overlayHandler.target, key, oDesc]);
			}
			if (!canWrite(this.const.object)) return;
			
			ensureInitialized(this, target);
			// if (state.incomingStructuresDisabled === 0) throw new Error("Not supported yet!");

			state.inPulse++;
			// TODO: Elaborate here?
			if (typeof(this.const._arrayObservers) !== 'undefined') {
				notifyChangeObservers(this.const._arrayObservers);
			}
			if (--state.inPulse === 0) postPulseCleanup();
			return target;
		}

		function getOwnPropertyDescriptorHandlerArray(target, key) {
			if (this.const.forwardsTo !== null) {
				let overlayHandler = this.const.forwardsTo.const.handler;
				return overlayHandler.getOwnPropertyDescriptor.apply(overlayHandler, [overlayHandler.target, key]);
			}

			ensureInitialized(this, target);
			
			if (state.inActiveRecording) {
				registerChangeObserver(getSpecifier(this.const, "_arrayObservers"));
			}
			return Object.getOwnPropertyDescriptor(target, key);
		}


		/***************************************************************
		 *
		 *  Object Handlers
		 *
		 ***************************************************************/
		
		function getHandlerObject(target, key) {
			if (trace.get > 0) {
				log("getHandlerObject: "  + this.const.name + "." + key);
				logGroup();
			}
			key = key.toString();
			// log("getHandlerObject: " + key);
			// if (key instanceof 'Symbol') { incoming
				// throw "foobar";
			// }
			ensureInitialized(this, target);
			
			if (this.const.forwardsTo !== null && key !== "nonForwardConst") {
				if (trace.get > 0) log("forwarding ... ");
				// TODO: test that this can handle recursive forwards. 
				let overlayHandler = this.const.forwardsTo.const.handler;
				if (trace.get > 0) log("apply ... ");
				let result = overlayHandler.get.apply(overlayHandler, [overlayHandler.target, key]);
				if (trace.get > 0) log("... finish apply");
				if (trace.get > 0) logUngroup();
				return result;
			}
			
			if (configuration.objectActivityList) registerActivity(this);
					
			if (key === "const" || key === "nonForwardConst") {
				if (trace.get > 0) logUngroup();
				return this.const;
			} else {
				if (typeof(key) !== 'undefined') {
					let scan = target;
					while ( scan !== null && typeof(scan) !== 'undefined' ) {
						let descriptor = Object.getOwnPropertyDescriptor(scan, key);
						if (typeof(descriptor) !== 'undefined' && typeof(descriptor.get) !== 'undefined') {
							if (trace.get > 0) logUngroup();
							// if (trace.get) log("returning bound thing...");
							return descriptor.get.bind(this.const.object)();
						}
						scan = Object.getPrototypeOf( scan );
					}
					let keyInTarget = key in target;
					if (state.inActiveRecording) {
						if (keyInTarget) {
							registerChangeObserver(getSpecifier(getSpecifier(this.const, "_propertyObservers"), key));
						} else {
							registerChangeObserver(getSpecifier(this.const, "_enumerateObservers"));
						}
					}
					if (state.incomingStructuresDisabled === 0) {
						// console.log("find referred object");
						// console.log(key);
						if (trace.get > 0) logUngroup();
						return getReferredObject(target[key]);
					} else {
						if (trace.get > 0) logUngroup();
						return target[key];
					}
				}
			}
		}
				
		
		function setHandlerObject(target, key, value) {
			// log("setHandlerObject" + key);
			if (configuration.reactiveStructuresAsCausalityObjects && key === '_cachedCalls') throw new Error("Should not be happening!");
			
			// Ensure initialized
			if (trace.basic > 0) {
				log("setHandlerObject: " + this.const.name + "." + key + "= ");
				// throw new Error("What the actual fuck, I mean jesuz..!!!");
				logGroup();
			}
			ensureInitialized(this, target);
			
			// Overlays
			if (this.const.forwardsTo !== null) {
				if (trace.basic > 0) log("forward");
				let overlayHandler = this.const.forwardsTo.const.handler;
				if (trace.basic > 0) logUngroup();
				return overlayHandler.set.apply(overlayHandler, [overlayHandler.target, key, value]);
			} else {
				trace.basic && log("no forward");
			}
			
			// Write protection
			if (!canWrite(this.const.object)) {
				if (trace.basic > 0) logUngroup();
				return;
			}
			if (trace.basic > 0) log("can write!");
			
			// Check if setting a property
			let scan = target;
			while ( scan !== null && typeof(scan) !== 'undefined' ) {
				let descriptor = Object.getOwnPropertyDescriptor(scan, key);
				if (typeof(descriptor) !== 'undefined' && typeof(descriptor.get) !== 'undefined') {
					if (trace.basic > 0) logUngroup();
					if (trace.basic) log("Calling setter!...");
					return descriptor.set.apply(this.const.object, [value]);
				}
				scan = Object.getPrototypeOf( scan );
			}
			
			// Note if key was undefined and get previous value
			let keyDefined = key in target;
			let previousValueOrIncomingStructure = target[key];
			let previousValue;
			if (keyDefined && typeof(previousValueOrIncomingStructure) === 'object' && state.incomingStructuresDisabled === 0) {
				previousValue = getReferredObject(previousValueOrIncomingStructure);
			} else {
				previousValue = previousValueOrIncomingStructure;
			}
			
			// If same value as already set, do nothing.
			if (keyDefined) {
				if (previousValue === value || (Number.isNaN(previousValue) && Number.isNaN(value)) ) {
					trace.basic && log("cannot set same value");
					if (trace.basic > 0) logUngroup();
					return true;
				}
			}
			
			// Manipulate activity list here? why not?
			if (configuration.objectActivityList) registerActivity(this);
			activityListFrozen++;
			
			// Pulse start
			state.inPulse++;
			state.observerNotificationPostponed++;
					
			// Perform assignment with regards to incoming structures.
			let valueOrIncomingStructure;
			if (state.incomingStructuresDisabled === 0) {
				trace.basic && log("use incoming structures...");
				state.incomingStructuresDisabled++;
				valueOrIncomingStructure = createAndRemoveIncomingRelations(this.const.object, key, value, previousValue, previousValueOrIncomingStructure);
				target[key] = valueOrIncomingStructure;
				state.incomingStructuresDisabled--;
			} else {
				trace.basic && log("plain assignment... ");
				target[key] = value;				
			}
			
			// Update incoming reference counters
			if (configuration.incomingReferenceCounters){
				trace.basic && log("use incoming reference counters...");
				if (configuration.incomingStructuresAsCausalityObjects) {
					increaseIncomingCounter(valueOrIncomingStructure);					
					decreaseIncomingCounter(previousValueOrIncomingStructure);
				} else {
					increaseIncomingCounter(value);					
					decreaseIncomingCounter(previousValue);					
				}
			}
			
			// If assignment was successful, notify change
			if (keyDefined) {
				if (typeof(this.const._propertyObservers) !== 'undefined' && typeof(this.const._propertyObservers[key]) !== 'undefined') {
					notifyChangeObservers(this.const._propertyObservers[key]);
				}
			} else {
				if (typeof(this.const._enumerateObservers) !== 'undefined') {
					notifyChangeObservers(this.const._enumerateObservers);
				}
			}

			// Emit event 
			if (state.incomingStructuresDisabled === 0 && configuration.incomingStructuresAsCausalityObjects) {
				emitSetEvent(this, key, valueOrIncomingStructure, previousValueOrIncomingStructure);
			} else {
				emitSetEvent(this, key, value, previousValue);
			}
			
			// End pulse 
			if (--state.observerNotificationPostponed === 0) proceedWithPostponedNotifications();
			if (--state.inPulse === 0) postPulseCleanup();
			if (trace.basic > 0) logUngroup();
			activityListFrozen--;
			return true;
		}

		function deletePropertyHandlerObject(target, key) {
			if (this.const.forwardsTo !== null) {
				let overlayHandler = this.const.forwardsTo.const.handler;
				overlayHandler.deleteProperty.apply(overlayHandler, [overlayHandler.target, key]);
				return true;
			}

			if (!canWrite(this.const.object)) return true;
			
			ensureInitialized(this, target);
			
			if (!(key in target)) {
				return true;
			} else {
				state.inPulse++;
				
				// Note if key was undefined and get previous value
				let previousValueOrIncomingStructure = target[key];
				let previousValue;
				if (typeof(previousValueOrIncomingStructure) === 'object' && state.incomingStructuresDisabled === 0) {
					previousValue = getReferredObject(previousValueOrIncomingStructure);
				} else {
					previousValue = previousValueOrIncomingStructure;
				}
				
				// Delete and remove incoming relations
				if (state.incomingStructuresDisabled === 0) {
					state.incomingStructuresDisabled++;
					removeIncomingRelation(this.const.object, key, previousValue, previousValueOrIncomingStructure);
					state.incomingStructuresDisabled--;
				} 
				delete target[key];
				
				if (configuration.incomingReferenceCounters){
					if (configuration.incomingStructuresAsCausalityObjects) {				
						decreaseIncomingCounter(previousValueOrIncomingStructure);
					} else {			
						decreaseIncomingCounter(previousValue);					
					}
				}
				
				
				if(!( key in target )) { // Write protected? // remove???
					if (typeof(this.const._enumerateObservers) !== 'undefined') {
						notifyChangeObservers(this.const._enumerateObservers);
					}
					
					if (configuration.incomingStructuresAsCausalityObjects) {
						emitDeleteEvent(this, key, previousValueOrIncomingStructure);
					} else {
						emitDeleteEvent(this, key, previousValue);
					}
				}
				if (--state.inPulse === 0) postPulseCleanup();
				if( key in target ) return false; // Write protected?
				return true;
			}
		}

		function ownKeysHandlerObject(target, key) { // Not inherited?
			if (this.const.forwardsTo !== null) {
				let overlayHandler = this.const.forwardsTo.const.handler;
				return overlayHandler.ownKeys.apply(overlayHandler, [overlayHandler.target, key]);
			}
			
			ensureInitialized(this, target);
			
			if (state.inActiveRecording) {
				registerChangeObserver(getSpecifier(this.const, "_enumerateObservers"));
			}
			let keys = Object.keys(target);
			return keys;
		}

		function hasHandlerObject(target, key) {
			if (this.const.forwardsTo !== null) {
				let overlayHandler = this.const.forwardsTo.const.handler;
				return overlayHandler.has.apply(overlayHandler, [overlayHandler.target, key]);
			}
			
			ensureInitialized(this, target);
			
			if (state.inActiveRecording) {
				registerChangeObserver(getSpecifier(this.const, "_enumerateObservers"));
			}
			return (key in target);
		}

		function definePropertyHandlerObject(target, key, descriptor) {
			if (this.const.forwardsTo !== null) {
				let overlayHandler = this.const.forwardsTo.const.handler;
				return overlayHandler.defineProperty.apply(overlayHandler, [overlayHandler.target, key]);
			}
					
			if (!canWrite(this.const.object)) return;

			ensureInitialized(this, target);
			
			state.inPulse++;
			let returnValue = Reflect.defineProperty(target, key, descriptor);
			// TODO: emitEvent here?

			if (typeof(this.const._enumerateObservers) !== 'undefined') {
				notifyChangeObservers(this.const._enumerateObservers);
			}
			if (--state.inPulse === 0) postPulseCleanup();
			return returnValue;
		}

		function getOwnPropertyDescriptorHandlerObject(target, key) {
			if (this.const.forwardsTo !== null) {
				let overlayHandler = this.const.forwardsTo.const.handler;
				return overlayHandler.getOwnPropertyDescriptor.apply(overlayHandler, [overlayHandler.target, key]);
			}
			
			ensureInitialized(this, target);
			
			if (state.inActiveRecording) {
				registerChangeObserver(getSpecifier(this.const, '_enumerateObservers'));
			}
			return Object.getOwnPropertyDescriptor(target, key);
		}


		/***************************************************************
		 *
		 *  Create
		 *
		 ***************************************************************/
		 
		let nextId = 0;
		// classRegistry = {};
		
		function addClasses(classes) {
			// log("addClasses!!");
			// log(classes, 2);
			Object.assign(classRegistry, classes); 
			// log(classRegistry, 2);
		};
		
		function assignClassNamesTo(object) {
			Object.assign(object, classRegistry);
		}
		 
		function createImmutable(initial) {
			state.inPulse++;
			if (typeof(initial.const) === 'undefined') {			
				initial.const = {
					id : nextId++,
					causalityInstance : causalityInstance
				};
			} else {
				initial.const.id = nextId++;
				initial.const.causalityInstance = causalityInstance;
			}
			
			emitImmutableCreationEvent(initial);
			if (--state.inPulse === 0) postPulseCleanup();
			return initial;
		} 

		function resetObjectIds() {
			nextId = 0;
		}
		 
		function create(createdTarget, cacheIdOrInitData) {
			if (trace.basic > 0) {
				log("create, target type: " + typeof(createdTarget));
				logGroup();
			}
			
			state.inPulse++;
			let id = nextId++;
			
			let initializer = null;
			if (typeof(createdTarget) === 'undefined') {
				createdTarget = {};
			} else if (typeof(createdTarget) === 'function') {
				initializer = createdTarget; 
				createdTarget = {};
			} else if (typeof(createdTarget) === 'string') {
				// log("create: " +  createdTarget);
				if (createdTarget === 'Array') {
					createdTarget = []; // On Node.js this is different from Object.create(eval("Array").prototype) for some reason... 
				} else if (createdTarget === 'Object') {
					createdTarget = {}; // Just in case of similar situations to above for some Javascript interpretors... 
				} else {
					let classOrPrototype = classRegistry[createdTarget];
					if (typeof(classOrPrototype) !== 'function') {
						throw new Error("No class found: " +  createdTarget);
					}
					// console.log(Object.keys(classRegistry));
					// console.log(createdTarget);
					// console.log(classOrPrototype);
					createdTarget = new classRegistry[createdTarget]();
				}
			}
			let cacheId = null;
			let initialData = null;
			if (typeof(cacheIdOrInitData) !== 'undefined') {
				if (typeof(cacheIdOrInitData) === 'string') {
					cacheId = cacheIdOrInitData; // TODO: int too? 
				} else {
					initialData = cacheIdOrInitData;
				}
			}

			let handler;
			if (createdTarget instanceof Array) {
				handler = {
					id : id, // TODO: remove?
					// _arrayObservers : null,
					// getPrototypeOf: function () {},
					// setPrototypeOf: function () {},
					// isExtensible: function () {},
					// preventExtensions: function () {},
					// apply: function () {},
					// construct: function () {},
					get: getHandlerArray,
					set: setHandlerArray,
					deleteProperty: deletePropertyHandlerArray,
					ownKeys: ownKeysHandlerArray,
					has: hasHandlerArray,
					defineProperty: definePropertyHandlerArray,
					getOwnPropertyDescriptor: getOwnPropertyDescriptorHandlerArray,
					activityListNext : null,
					activityListPrevious : null				
				};
							// Optimization
				// if (!configuration.activateSpecialFeatures) {
					// handler.get = getHandlerArrayOptimized;
				// }
			} else {
				// let _propertyObservers = {};
				// for (property in createdTarget) {
				//     _propertyObservers[property] = {};
				// }
				handler = {
					id : id, // TODO: remove?
					// getPrototypeOf: function () {},
					// setPrototypeOf: function () {},
					// isExtensible: function () {},
					// preventExtensions: function () {},
					// apply: function () {},
					// construct: function () {},
					// _enumerateObservers : {},
					// _propertyObservers: _propertyObservers,
					get: getHandlerObject,
					set: setHandlerObject,
					deleteProperty: deletePropertyHandlerObject,
					ownKeys: ownKeysHandlerObject,
					has: hasHandlerObject,
					defineProperty: definePropertyHandlerObject,
					getOwnPropertyDescriptor: getOwnPropertyDescriptorHandlerObject,
					activityListNext : null,
					activityListPrevious : null				
				};
				// Optimization
				// if (!configuration.activateSpecialFeatures) {
					// handler.set = setHandlerObjectOptimized;
					// handler.get = getHandlerObjectOptimized;
				// }
			}

			let initialConst = createdTarget.const;
			delete createdTarget.const;
			handler.target = createdTarget;
			
			// createdTarget.const.id = id; // TODO ??? 
					
			let proxy = new Proxy(createdTarget, handler);
			
			handler.const = {
				incomingReferences : 0, 
				initializer : initializer,
				causalityInstance : causalityInstance,
				id: id,
				name: createdTarget.name,
				cacheId : cacheId,
				forwardsTo : null,
				target: createdTarget,
				handler : handler,
				object : proxy,
				
				// This inside these functions will be the Proxy. Change to handler?
				repeat : genericRepeatMethod.bind(proxy),
				tryStopRepeat : genericStopRepeatFunction.bind(proxy),

				observe: genericObserveFunction.bind(proxy),

				cached : genericCallAndCacheFunction.bind(proxy),
				cachedInCache : genericCallAndCacheInCacheFunction.bind(proxy),
				reCached : genericReCacheFunction.bind(proxy),
				reCachedInCache : genericReCacheInCacheFunction.bind(proxy),
				tryUncache : genericUnCacheFunction.bind(proxy),

				// reCache aliases
				project : genericReCacheFunction.bind(proxy),
				projectInProjectionOrCache : genericReCacheInCacheFunction.bind(proxy),

				// Identity and state
				mergeFrom : genericMergeFrom.bind(proxy),
				forwardTo : genericForwarder.bind(proxy),
				removeForwarding : genericRemoveForwarding.bind(proxy),
				mergeAndRemoveForwarding: genericMergeAndRemoveForwarding.bind(proxy)
			};
			for(property in initialConst) {
				handler.const[property] = initialConst[property];
			}
			
			if (typeof(createdTarget.const) !== 'undefined') {
				for (property in createdTarget.const) {
					handler.const[property] = createdTarget.const[property]; 
				}
			}
			
			handler.const.const = handler.const;
			// handler.const.nonForwardConst = handler.const;
			
			// TODO: consider what we should do when we have reverse references. Should we loop through createdTarget and form proper reverse structures?
			// Experiments: 
			// withoutEmittingEvents(function() {
				// for (property in createdTarget) {
					// proxy[property] = createdTarget[property];
				// }
			// });
			// However, will witout emitting events work for eternity? What does it want really?

			if (inReCache()) {
				if (cacheId !== null &&  typeof(state.context.cacheIdObjectMap[cacheId]) !== 'undefined') {
					// Overlay previously created
					let infusionTarget = state.context.cacheIdObjectMap[cacheId]; // TODO: this map should be compressed in regards to multi level zombies.
					infusionTarget.nonForwardConst.storedForwardsTo = infusionTarget.nonForwardConst.forwardsTo;
					infusionTarget.nonForwardConst.forwardsTo = proxy;
					state.context.newlyCreated.push(infusionTarget);
					return infusionTarget;   // Borrow identity of infusion target.
				} else {
					// Newly created in this reCache cycle. Including overlaid ones.
					state.context.newlyCreated.push(proxy);
				}
			}

			if (state.writeRestriction !== null) {
				state.writeRestriction[proxy.const.id] = true;
			}
			
			emitCreationEvent(handler);
			if (configuration.objectActivityList) registerActivity(handler);
			if (--state.inPulse === 0) postPulseCleanup();
			
			if (trace.basic > 0) logUngroup();
			
			if(!state.blockInitialize && typeof(proxy.initialize) === 'function' ) {
				if (initialData === null) {
					initialData = {};
				}
				proxy.initialize.apply(proxy, [initialData]);
			}
			return proxy;
		}

		function isObject(entity) {
			// console.log();
			// console.log("isObject:");

			let typeCorrect = typeof(entity) === 'object';
			let notNull = entity !== null;
			let hasConst = false;			
			let rightCausalityInstance = false;
			
			if (typeCorrect && notNull) {
				hasConst = typeof(entity.const) !== 'undefined';
				// console.log("rightafter")
				// console.log(hasConst);
			
				if (hasConst === true) {
					rightCausalityInstance = entity.const.causalityInstance === causalityInstance;
				}
			}
			
			// console.log(typeCorrect);
			// console.log(notNull);
			// console.log(hasConst);
			// console.log(rightCausalityInstance);
			let result = (typeCorrect && notNull && hasConst && rightCausalityInstance); 
			// console.log(result);
			return result; 
			
			// One go!
			// return typeof(entity) === 'object' && entity !== null && typeof(entity.const) !== 'undefined' && entity.const.causalityInstance === causalityInstance;
		}
		
		/**********************************
		 *
		 * Initialization
		 *
		 **********************************/
		 
		function ensureInitialized(handler, target) {
			if (handler.const.initializer !== null && state.blockingInitialize === 0) {
				if (trace.basic > 0) { log("initializing..."); logGroup() }
				let initializer = handler.const.initializer;
				handler.const.initializer = null;
				initializer(handler.const.object);
				if (trace.basic > 0) logUngroup();
			}
		}
		
		function blockInitialize(action) {
			state.blockingInitialize++;
			action();
			state.blockingInitialize--;
		}
		// function purge(object) {
			// object.target.
		// } 
		 
			
		/**********************************
		 *
		 * Security and Write restrictions
		 *
		 **********************************/
		 
		function canWrite(object) {
			// if (postPulseProcess > 0) {
				// return true;
			// }
			// log("CANNOT WRITE IN POST PULSE");
				// return false;
			// }
			if (state.writeRestriction !== null && typeof(state.writeRestriction[object.const.id]) === 'undefined') {
				return false;
			}
			if (customCanWrite !== null) {
				return customCanWrite(object);
			}
			return true;
		} 

		function canRead(object) {
			if (customCanRead !== null) {
				return customCanRead(object);
			}
			return true;
		}

		/**********************************
		 *
		 *   Causality Global stack
		 *
		 **********************************/


		function inCachedCall() {
			if (state.context === null) {
				return false;
			} else {
				return state.context.type === "cached_call";
			}
		}

		function inReCache() {
			if (state.context === null) {
				return false;
			} else {
				return state.context.type === "reCache";
			}
		}

		function noContext() {
			return state.context === null;
		}

		function updateInActiveRecording() {
			state.inActiveRecording = (state.microContext === null) ? false : ((state.microContext.type === "recording") && state.recordingPaused === 0);
			state.activeRecording = state.inActiveRecording ? state.microContext : null;
		}

		function getActiveRecording() {
			return state.activeRecording;
			// if ((state.microContext === null) ? false : ((state.microContext.type === "recording") && state.recordingPaused === 0)) {
				// return state.microContext;
			// } else {
				// return null;
			// }
		}

		function inActiveRepetition() {
			return (state.microContext === null) ? false : ((state.microContext.type === "repeater") && state.recordingPaused === 0);
		}

		function getActiveRepeater() {
			if ((state.microContext === null) ? false : ((state.microContext.type === "repeater") && state.recordingPaused === 0)) {
				return state.microContext;
			} else {
				return null;
			}
		}


		function enterContextAndExpectMicroContext(type, enteredContext) {
			state.nextIsMicroContext = true;
			enterContext(type, enteredContext);
		}


		function removeChildContexts(context) {
			if (typeof(context.children) !== 'undefined' && context.children.length > 0) {
				context.children.forEach(function (child) {
					child.remove();
				});
				context.children = [];
			}
		}

		// occuring types: recording, repeater_refreshing, cached_call, reCache, block_side_effects
		function enterContext(type, enteredContext) {
			if (typeof(enteredContext.initialized) === 'undefined') {
				// Enter new context
				enteredContext.type = type;
				enteredContext.macro = null;

				enteredContext.directlyInvokedByApplication = (state.context === null);
				if (state.nextIsMicroContext) {
					// Build a micro context
					enteredContext.macro = state.microContext;
					state.microContext.micro = enteredContext;
					state.nextIsMicroContext = false;
				} else {
					// Build a new macro context
					enteredContext.children = [];

					if (state.context !== null && typeof(enteredContext.independent) === 'undefined') {
						state.context.children.push(enteredContext);
					}
					state.context = enteredContext;
				}
				state.microContext = enteredContext;

				enteredContext.initialized = true;
			} else {
				// Re-enter context
				let primaryContext = enteredContext;
				while (primaryContext.macro !== null) {
					primaryContext = primaryContext.macro
				}
				state.context = primaryContext;

				state.microContext = enteredContext;
			}

			// Debug printout of macro hierarchy
			// let macros = [enteredContext];
			// let macro =  enteredContext.macro;
			// while(macro !== null) {
			//     macros.unshift(macro);
			//     macro = macro.macro;
			// }
			// console.log("====== enterContext ======== " + state.causalityStack.length + " =" + macros.map((context) => { return context.type; }).join("->"));
			updateInActiveRecording();
			state.causalityStack.push(enteredContext);
			return enteredContext;
		}


		function leaveContext() {
			let leftContext = state.causalityStack.pop();
			if (state.causalityStack.length > 0) {
				state.microContext = state.causalityStack[state.causalityStack.length - 1];
				let scannedContext = state.microContext;
				while (scannedContext.macro !== null) {
					scannedContext = scannedContext.macro;
				}
				state.context = scannedContext;
			} else {
				state.context = null;
				state.microContext = null;
			}
			updateInActiveRecording();
			// console.log("====== leaveContext ========" + leftContext.type);
		}


		/**********************************
		 *  Pulse & Transactions
		 *
		 *  Upon change do
		 **********************************/
		
		function pulse(action) {
			state.inPulse++;
			let result = action();
			if (--state.inPulse === 0) postPulseCleanup();
			return result;
		}

		let transaction = postponeObserverNotification;

		function postponeObserverNotification(action) {
			state.inPulse++;
			state.observerNotificationPostponed++;
			action();
			state.observerNotificationPostponed--;
			proceedWithPostponedNotifications();
			if (--state.inPulse === 0) postPulseCleanup();
		}

		function postPulseCleanup() {
			state.inPulse++; // block new pulses!			
			state.inPostPulseProcess++; // Blocks any model writing during post pulse cleanup

			state.contextsScheduledForPossibleDestruction.forEach(function(context) {
				if (!context.directlyInvokedByApplication) {
					if (emptyObserverSet(context.contextObservers)) {
						context.remove();
					}
				}
			});
			state.contextsScheduledForPossibleDestruction = [];
			postPulseHooks.forEach(function(callback) {
				callback(state.pulseEvents);
			});

			state.pulseEvents = [];
			state.inPostPulseProcess--;
			state.inPulse--;
		}


		/**********************************
		 *  Observe
		 *
		 *
		 **********************************/
		
		function withoutEmittingEvents(action) {
			state.inPulse++;
			state.emitEventPaused++;
			// log(configuration.name + "pause emitting events");
			// logGroup();
			// log(configuration.name + " state.inPulse: " + state.inPulse);
			action();
			// log("state.inPulse: " + state.inPulse);
			// log(configuration.name + " state.inPulse: " + state.inPulse);
			// logUngroup();
			state.emitEventPaused--;
			if (--state.inPulse === 0) postPulseCleanup();
		}

		function emitImmutableCreationEvent(object) {
			if (configuration.recordPulseEvents) {
				let event = { type: 'creation', object: object }
				if (configuration.recordPulseEvents) {
					state.pulseEvents.push(event);
				}
			}		
		} 
		
		function emitCreationEvent(handler) {
			if (configuration.recordPulseEvents) {
				emitEvent(handler, { type: 'creation' });
			}		
		} 
		 
		function emitSpliceEvent(handler, index, removed, added) {
			if (configuration.recordPulseEvents || typeof(handler.observers) !== 'undefined') {
				emitEvent(handler, { type: 'splice', index: index, removed: removed, added: added});
			}
		}

		function emitSpliceReplaceEvent(handler, key, value, previousValue) {
			if (configuration.recordPulseEvents || typeof(handler.observers) !== 'undefined') {
				emitEvent(handler, { type: 'splice', index: key, removed: [previousValue], added: [value] });
			}
		}

		function emitSetEvent(handler, key, value, previousValue) {
			if (trace.basic) {
				log("emitSetEvent");
				log(configuration);
				
			}
			if (configuration.recordPulseEvents || typeof(handler.observers) !== 'undefined') {
				emitEvent(handler, {type: 'set', property: key, value: value, oldValue: previousValue});
			}
		}

		function emitDeleteEvent(handler, key, previousValue) {
			if (configuration.recordPulseEvents || typeof(handler.observers) !== 'undefined') {
				emitEvent(handler, {type: 'delete', property: key, oldValue: previousValue});
			}
		}

		function emitEvent(handler, event) {
			if (trace.basic) {
				log("emitEvent: ");// + event.type + " " + event.property);
				log(event);
				log("state.emitEventPaused: " + state.emitEventPaused);
			}
			if (state.emitEventPaused === 0) {
				// log("EMIT EVENT " + configuration.name + " " + event.type + " " + event.property + "=...");
				event.object = handler.const.object; 
				// event.isConsequence = state.refreshingRepeater;
				if (configuration.recordPulseEvents) {
					state.pulseEvents.push(event);
				}
				if (typeof(handler.observers) !== 'undefined') {
					handler.observers.forEach(function(observerFunction) {
						observerFunction(event);
					});
				}
			}
		}
		
		function emitUnobservableEvent(event) { // TODO: move reactiveStructuresAsCausalityObjects upstream in the call chain..  
			// throw new Error("Should not be here!!");
			if (configuration.reactiveStructuresAsCausalityObjects && configuration.recordPulseEvents) {
				state.pulseEvents.push(event);
			}
		}

		function observeAll(array, callback) {
			array.forEach(function(element) {
				element.const.observe(callback);
			});
		}

		function genericObserveFunction(observerFunction) {
			let handler = this.const.handler;
			if (typeof(handler.observers) === 'undefined') {
				handler.observers = [];
			}
			handler.observers.push(observerFunction);
		}


		/**********************************
		 *  Actions
		 *
		 **********************************/
		 
		/**
		* Forms: 
		* 
		* createAction(function)
		* createAction(functionName, arglist)
		* createAction(functionPath, arglist)
		* createAction(object, methodName, arglist)
		*/
		function createAction() {
			arguments = argumentsToArray(arguments);
			let argumentsLength = arguments.length;
			if (argumentsLength === 1) {
				return arguments[0];
			} else if (argumentsLength === 2){
				if (arguments[0] instanceof Array) {
					let action = {
						functionPath : arguments.unshift(),
						arguments : arguments
					};
					if (configuration.reactiveStructuresAsCausalityObjects) {
						action.functionPath = createImmutable(action.functionPath);						
						action.arguments = createImmutable(action.arguments);
						action = createImmutable(action);
					}
					return action;
				} else {
					let action = {
						functionName : arguments.unshift(),
						arguments : arguments
					};
					if (configuration.reactiveStructuresAsCausalityObjects) {
						action.arguments = createImmutable(action.arguments);
						action = createImmutable(action);
					}
					return action;
				}
			} else if (argumentsLength === 3) {
				let action = {
					object : arguments.unshift(),
					methodName : arguments.unshift(),
					arguments : arguments
				};
				if (configuration.reactiveStructuresAsCausalityObjects) {
					action.arguments = createImmutable(action.arguments);
					action = createImmutable(action);
				}
				return action;
			}
		}
		
		function performAction(action) {
			if (typeof(action) === 'function') {
				return action();
			} else {
				if (typeof(action.object) === 'undefined') {
					if (typeof(action.functionPath) === 'undefined') {
						// TODO: use window also...
						return global[action.methodName].apply(null, action.arglist);
					} else {
						let tmpFunction = null;
						action.functionPath.forEach(function(name) {
							if (tmpFunction === null) {
								tmpFunction = global[action.methodName];
							} else {
								tmpFunction = tmpFunction[name]; 
							}
						});
						return tmpFunction.apply(null, action.arglist);
					}
				} else {
					return action.object[action.methodName].apply(action.object, action.arglist);
				}
			}
		}
		
		/**********************************
		 *    Basic observation
		 *   
		 *
		 **********************************/
		
		function observe(action, observer) {
			enterContext('recording', context);
			let returnValue = performAction(action);
			leaveContext();
			return returnValue;
		}
		

		/**********************************
		 *  Dependency recording
		 *
		 *  Upon change do
		 **********************************/

		function uponChangeDo() { // description(optional), doFirst, doAfterChange. doAfterChange cannot modify model, if needed, use a repeater instead. (for guaranteed consistency)
			// TODO: Consider, should this start a pulse?
			// Arguments
			let doFirst;
			let doAfterChange;
			let description = null;
			if (arguments.length > 2) {
				description   = arguments[0];
				doFirst       = arguments[1];
				doAfterChange = arguments[2];
			} else {
				doFirst       = arguments[0];
				doAfterChange = arguments[1];
			}
			// log("createImmutable...");
			// Recorder context
			let context = {
				nextToNotify: null,
				description: description,
				uponChangeAction: doAfterChange,
				remove : function() {
					let id = typeof(this.const) !== 'undefined' ? this.const.id : this.id;
					this.sources.forEach(function(observerSet) {
						removeReverseReference(id, observerSet);
					});
					this.sources.lenght = 0;  // From repeater itself.
				}
			};
			if (configuration.reactiveStructuresAsCausalityObjects) context = createImmutable(context);
			// log("createReactiveArrayIndex...");
			createReactiveArrayIndex(context, "sources");
			
			// log("enterContext...");
			enterContext('recording', context);
			let returnValue = performAction(doFirst);
			leaveContext();

			return returnValue;
		}

		function assertNotRecording() {
			if (state.inActiveRecording) {
				throw new Error("Should not be in a recording right now...");
			}
		}
		
		function withoutRecording(action) {
			state.recordingPaused++;
			updateInActiveRecording();
			action();
			state.recordingPaused--;
			updateInActiveRecording();
		}

		function emptyObserverSet(observerSet) {
			return observerSet.contentsCounter === 0 && observerSet.first === null;
		}

		function registerAnyChangeObserver(observerSet) { // instance can be a cached method if observing its return value, object
			if (state.inActiveRecording) {
				registerChangeObserver(observerSet);
			}
		}
		
		let nextObserverSetId = 0;
		function registerChangeObserver(observerSet) {
			// Find right place in the incoming structure.
			let activeRecordingId; 
			if (typeof(state.activeRecording.const) !== 'undefined') {
				activeRecordingId = state.activeRecording.const.id;
			} else {
				if (typeof(state.activeRecording.id) === 'undefined') state.activeRecording.id = nextObserverSetId++;
				activeRecordingId = state.activeRecording.id;
			}
			let incomingRelationChunk = intitializeAsReverseReferencesChunkListThenAddIfNeeded(observerSet, state.activeRecording, activeRecordingId);
			if (incomingRelationChunk !== null) {
				state.activeRecording.sources.push(incomingRelationChunk);
			}
		}


		/** -------------
		 *  Upon change
		 * -------------- */

		let nextObserverToNotifyChange = null;
		let lastObserverToNotifyChange = null;
		
		function proceedWithPostponedNotifications() {
			if (state.observerNotificationPostponed == 0) {
				while (nextObserverToNotifyChange !== null) {
					let recorder = nextObserverToNotifyChange;
					nextObserverToNotifyChange = nextObserverToNotifyChange.nextToNotify;
					// blockSideEffects(function() {
					performAction(recorder.uponChangeAction);
					// });
				}
				lastObserverToNotifyChange = null;
			}
		}

		function nullifyObserverNotification(callback) {
			state.observerNotificationNullified++;
			callback();
			state.observerNotificationNullified--;
		}


		// Recorders is a map from id => recorder
		// A bit like "for all incoming"...
		function notifyChangeObservers(observers) {
			if (typeof(observers.initialized) !== 'undefined') {
				if (state.observerNotificationNullified > 0) {
					return;
				}

				let contents = observers.contents;
				for (id in contents) {
					notifyChangeObserver(contents[id]);
				}

				if (typeof(observers.first) !== 'undefined') {
					let chainedObserverChunk = observers.first;
					while(chainedObserverChunk !== null) {
						let contents = chainedObserverChunk.contents;
						for (id in contents) {
							notifyChangeObserver(contents[id]);
						}
						chainedObserverChunk = chainedObserverChunk.next;
					}
				}
			}
		}

		function notifyChangeObserver(observer) {
			if (observer != state.microContext) {
				if (typeof(observer.remove) === 'function') {
					observer.remove(); // Cannot be any more dirty than it already is!					
				}
				if (state.observerNotificationPostponed > 0) {
					if (lastObserverToNotifyChange !== null) {
						lastObserverToNotifyChange.nextToNotify = observer;
					} else {
						nextObserverToNotifyChange = observer;
					}
					lastObserverToNotifyChange = observer;
				} else {
					// blockSideEffects(function() {
					performAction(observer.uponChangeAction);
					// });
				}
			}
		}


		/**********************************
		 *
		 *   Repetition
		 *
		 **********************************/
		
		let firstDirtyRepeater = null; 
		let lastDirtyRepeater = null;

		function clearRepeaterLists() {
			recorderId = 0;
			firstDirtyRepeater = null;
			lastDirtyRepeater = null;
		}

		function detatchRepeater(repeater) {
			if (lastDirtyRepeater === repeater) {
				lastDirtyRepeater = repeater.previousDirty;
			}
			if (firstDirtyRepeater === repeater) {
				firstDirtyRepeater = repeater.nextDirty;
			}
			if (repeater.nextDirty) {
				repeater.nextDirty.previousDirty = repeater.previousDirty;
			}
			if (repeater.previousDirty) {
				repeater.previousDirty.nextDirty = repeater.nextDirty;
			}
		}

		function repeatOnChange() { // description(optional), action
			// Arguments
			let repeaterAction;
			let description = '';
			if (arguments.length > 1) {
				description    = arguments[0];
				repeaterAction = arguments[1];
			} else {
				repeaterAction = arguments[0];
			}

			// Activate!
			let repeater = {
				description: description,
				action: repeaterAction,
				remove : function() {
					// console.log("removeRepeater: " + repeater.const.id + "." + repeater.description);
					removeChildContexts(this);
					detatchRepeater(this);
					this.micro.remove(); // Remove recorder!
				},
				nextDirty : null,
				previousDirty : null
			}
			if (configuration.reactiveStructuresAsCausalityObjects) repeater = createImmutable(repeater)
			return refreshRepeater(repeater);
		}

		function refreshRepeater(repeater) {
			state.refreshingRepeater = true;
			enterContext('repeater_refreshing', repeater);
			// console.log("parent context type: " + repeater.parent.type);
			// console.log("context type: " + repeater.type);
			state.nextIsMicroContext = true;
			repeater.returnValue = uponChangeDo(
				repeater.action,
				function () {
					// unlockSideEffects(function() {
					repeaterDirty(repeater);
					// });
				}
			);
			leaveContext();
			state.refreshingRepeater = false;
			return repeater;
		}

		function repeaterDirty(repeater) { // TODO: Add update block on this stage?
			removeChildContexts(repeater);

			if (lastDirtyRepeater === null) {
				lastDirtyRepeater = repeater;
				firstDirtyRepeater = repeater;
			} else {
				lastDirtyRepeater.nextDirty = repeater;
				repeater.previousDirty = lastDirtyRepeater;
				lastDirtyRepeater = repeater;
			}

			refreshAllDirtyRepeaters();
		}

		function refreshAllDirtyRepeaters() {
			if (!state.refreshingAllDirtyRepeaters) {
				if (firstDirtyRepeater !== null) {
					state.refreshingAllDirtyRepeaters = true;
					while (firstDirtyRepeater !== null) {
						let repeater = firstDirtyRepeater;
						detatchRepeater(repeater);
						refreshRepeater(repeater);
					}

					state.refreshingAllDirtyRepeaters = false;
				}
			}
		}


		/************************************************************************
		 *
		 *                    Cached method signatures
		 *
		 *          (reused by cache, repeat and project)
		 ************************************************************************/

		function compareArraysShallow(a, b) {
			if( typeof a !== typeof b )
				return false;
			
			if (a.length === b.length) {
				for (let i = 0; i < a.length; i++) {
					if (a[i] !== b[i]) {
						return false;
					}
				}
				return true;
			} else {
				return false;
			}
		}

		function isCachedInBucket(functionArgumentHashCaches, functionArguments) {
			if (functionArgumentHashCaches.length === 0) {
				return false;
			} else {
				// Search in the bucket!
				for (let i = 0; i < functionArgumentHashCaches.length; i++) {
					if (compareArraysShallow(functionArgumentHashCaches[i].functionArguments, functionArguments)) {
						return true;
					}
				}
				return false;
			}
		}

		function cachedCallCount() {
			return state.cachedCallsCount;
		}

		function getObjectAttatchedCache(object, cacheStoreName, functionName) {
			// object = object.const.handler;
			// let functionCaches = getMap(object, cacheStoreName, functionName);
			if (typeof(object[cacheStoreName]) === 'undefined') {
				let cacheStore = {};
				if (configuration.reactiveStructuresAsCausalityObjects) cacheStore = createImmutable(cacheStore);
				// cacheStore.const.exclusiveReferer = object; // Only refered to by object. TODO: implement in more places...
				object[cacheStoreName] = cacheStore; // TODO: These are actually not immutable, more like unobservable. They can change, but changes needs to register manually.... 
			}
			if (typeof(object[cacheStoreName][functionName]) === 'undefined') {
				let cacheFunctionStore = {};
				if (configuration.reactiveStructuresAsCausalityObjects) cacheFunctionStore = createImmutable(cacheFunctionStore);
				object[cacheStoreName][functionName] = cacheFunctionStore;
			}
			return object[cacheStoreName][functionName];
		}
		
		// Get cache(s) for this argument hash
		// function caches has to be a full object.
		function getFunctionCacher(functionCaches, argumentList) {
			let uniqueHash = true;
			function makeArgumentHash(argumentList) {
				let hash  = "";
				let first = true;
				argumentList.forEach(function (argument) {
					if (!first) {
						hash += ",";
					}

					if (isObject(argument)) { //typeof(argument) === 'object' &&
						hash += "{id=" + argument.const.id + "}";
					} else if (typeof(argument) === 'number' || typeof(argument) === 'string') { // String or integer
						hash += argument;
					} else {
						uniqueHash = false;
						hash += "{}"; // Non-identifiable, we have to rely on the hash-bucket.
					}
				});
				return "(" + hash + ")";
			}
			let argumentsHash = makeArgumentHash(argumentList);

			return {
				cacheRecordExists : function() {
					// Figure out if we have a chache or not
					let result = null;
					if (uniqueHash) {
						return typeof(functionCaches[argumentsHash]) !== 'undefined';
					} else {
						if (typeof(functionCaches[argumentsHash]) !== 'undefined') {
							let cacheBucket = functionCaches[argumentsHash];
							for (let i = 0; i < cacheBucket.length; i++) {
								if (compareArraysShallow(cacheBucket[i].functionArguments, functionArguments)) {
									return true;
								}
							}
						}
						return false;
					}
				},

				deleteExistingRecord : function() {
					if (uniqueHash) {
						let result = functionCaches[argumentsHash];
						delete functionCaches[argumentsHash];
						emitUnobservableEvent({object: functionCaches, type: 'delete', oldValue: result});
						return result;
					} else {
						let cacheBucket = functionCaches[argumentsHash];					
						for (let i = 0; i < cacheBucket.length; i++) {
							if (compareArraysShallow(cacheBucket[i].functionArguments, functionArguments)) {
								let result = cacheBucket[i];
								cacheBucket.splice(i, 1);
								emitUnobservableEvent({object: functionCaches, type: 'splice', index: 1, added: [], removed: [result]});
								return result;
							}
						}
					}
				},

				getExistingRecord : function() {
					if (uniqueHash) {
						return functionCaches[argumentsHash]
					} else {
						let cacheBucket = functionCaches[argumentsHash]
						for (let i = 0; i < cacheBucket.length; i++) {
							if (compareArraysShallow(cacheBucket[i].functionArguments, functionArguments)) {
								return cacheBucket[i];
							}
						}
					}
				},
				
				createNewRecord : function() {
					if (uniqueHash) {
						let newCacheRecord = {};
						if (configuration.reactiveStructuresAsCausalityObjects) newCacheRecord = createImmutable(newCacheRecord); 
						functionCaches[argumentsHash] = newCacheRecord;
						emitUnobservableEvent({object: functionCaches, type: 'set', property: argumentsHash, oldValueUndefined: true , value: newCacheRecord});
						return functionCaches[argumentsHash];
					} else {
						if (typeof(functionCaches[argumentsHash]) === 'undefined') {
							let cacheBucket = [];
							if (configuration.reactiveStructuresAsCausalityObjects) cacheBucket = createImmutable(cacheBucket);
							functionCaches[argumentsHash] = cacheBucket;
							emitUnobservableEvent({object: functionCaches, type: 'set', property: argumentsHash , oldValueUndefined: true , value: cacheBucket});
						}
						let hashBucket = functionCaches[argumentsHash];
						let newCacheRecord = {};
						if (configuration.reactiveStructuresAsCausalityObjects) newCacheRecord = createImmutable(newCacheRecord);
						hashBucket.push(newCacheRecord);
						emitUnobservableEvent({object: hashBucket, type: 'splice', index: "foo", removed: null , added: [newCacheRecord]});
						return newCacheRecord;
					}
				}
			};
		}


		/************************************************************************
		 *
		 *                    Generic repeat function
		 *
		 ************************************************************************/

		function genericRepeatMethod() {
			// Split arguments
			let argumentsList = argumentsToArray(arguments);
			let functionName = argumentsList.shift();
			
			repeatForUniqueArgumentLists(
				getObjectAttatchedCache(this, "_repeaters", functionName), 
				argumentsList,
				function() {
					return this[functionName].apply(this, argumentsList);
				}.bind(this)
			);
		}

		// function repeatForUniqueCall(repeatedFunction, argumentLists) {
			// if (typeof(repeatedFunction.__call_repeat_cache) === 'undefined') {
				// repeatedFunction.__call_repeat_cache = {};
			// }
			// let cache = repeatedFunction.__call_repeat_cache;
			// repeatForUniqueArgumentLists(
				// cache, 
				// argumentList, 
				// function() {
					// return repeatedFunction.apply(null, argumentsList); // Will this work if this is already bound?
				// }
			// );
		// }
		
		function repeatForUniqueArgumentLists(cache, argumentsList, repeatedFunction) {
			let functionCacher = getFunctionCacher(cache, argumentsList);
			
			if (!functionCacher.cacheRecordExists()) {
				// Never encountered these arguments before, make a new cache
				let cacheRecord = functionCacher.createNewRecord();
				cacheRecord.independent = true; // Do not delete together with parent
				cacheRecord.remove = function() {
					functionCacher.deleteExistingRecord();
					cacheRecord.micro.remove();
				};
				getSpecifier(cacheRecord, "contextObservers").removedCallback = function() {
					state.contextsScheduledForPossibleDestruction.push(cacheRecord);
				};
				enterContext('cached_repeater', cacheRecord);
				state.nextIsMicroContext = true;

				// cacheRecord.remove = function() {}; // Never removed directly, only when no observers & no direct application call
				cacheRecord.repeaterHandle = repeatOnChange(repeatedFunction);
				leaveContext();

				registerAnyChangeObserver(cacheRecord.contextObservers);
				return cacheRecord.repeaterHandle; // return something else...
			} else {
				let cacheRecord = functionCacher.getExistingRecord();
				registerAnyChangeObserver(cacheRecord.contextObservers);
				return functionCacher.getExistingRecord().repeaterHandle;
			}
		}

		function genericStopRepeatFunction() {
			// Split arguments
			let argumentsList = argumentsToArray(arguments);
			let functionName = argumentsList.shift();
			
			let cache = getObjectAttatchedCache(this, "_repeaters", functionName);
			let functionCacher = getFunctionCacher(cache, argumentsList);

			if (functionCacher.cacheRecordExists()) {
				let cacheRecord = functionCacher.getExistingRecord();
				if (emptyObserverSet(cacheRecord.contextObservers)) {
					functionCacher.deleteExistingRecord();
				}
			}
		}


		/************************************************************************
		 *  Cached methods
		 *
		 * A cached method will not reevaluate for the same arguments, unless
		 * some of the data it has read for such a call has changed. If there
		 * is a parent cached method, it will be notified upon change.
		 * (even if the parent does not actually use/read any return value)
		 ************************************************************************/

		function genericCallAndCacheInCacheFunction() {
			let argumentsArray = argumentsToArray(arguments);
			if (inCachedCall() > 0) {
				return this.const.cached.apply(this, argumentsArray);
			} else {
				let functionName = argumentsArray.shift();
				return this[functionName].apply(this, argumentsArray);
			}
		}
		
		function genericCallAndCacheFunction() {
			// Split arguments
			let argumentsList = argumentsToArray(arguments);
			let functionName = argumentsList.shift();
			
			return callAndCacheForUniqueArgumentLists(
				getObjectAttatchedCache(configuration.reactiveStructuresAsCausalityObjects ? this : this.const, "_cachedCalls", functionName), 
				argumentsList,
				function() {
					return this[functionName].apply(this, argumentsList);
				}.bind(this)
			);
		}
		
		function callAndCacheForUniqueArgumentLists(cache, argumentsList, callAction) {
			let functionCacher = getFunctionCacher(cache, argumentsList);

			if (!functionCacher.cacheRecordExists()) {
				let cacheRecord = functionCacher.createNewRecord();
				cacheRecord.independent = true; // Do not delete together with parent

				// Is this call non-automatic
				cacheRecord.remove = function() {
					functionCacher.deleteExistingRecord();
					cacheRecord.micro.remove(); // Remove recorder
				};

				state.cachedCallsCount++;
				enterContext('cached_call', cacheRecord);
				state.nextIsMicroContext = true;
				// Never encountered these arguments before, make a new cache
				let returnValue = uponChangeDo(
					function () {
						let returnValue;
						// blockSideEffects(function() {
						returnValue = callAction();
						// }.bind(this));
						return returnValue;
					}.bind(this),
					function () {
						// Delete function cache and notify
						let cacheRecord = functionCacher.deleteExistingRecord();
						notifyChangeObservers(cacheRecord.contextObservers);
					}.bind(this));

					// Future design:
				// let returnValue = uponChangeDo(
					// function () {
						// return callAction();
					// }.bind(this),
					// createImmutable({
						// object: cacheRecord,
						// method: "notifyObservers"
					// })
				// );	
					
				leaveContext();
				cacheRecord.returnValue = returnValue;
				getSpecifier(cacheRecord, "contextObservers").removedCallback = function() {
					state.contextsScheduledForPossibleDestruction.push(cacheRecord);
				};
				registerAnyChangeObserver(cacheRecord.contextObservers);
				return returnValue;
			} else {
				// Encountered these arguments before, reuse previous repeater
				let cacheRecord = functionCacher.getExistingRecord();
				registerAnyChangeObserver(cacheRecord.contextObservers);
				return cacheRecord.returnValue;
			}
		}
		

		function genericUnCacheFunction() {
			// Split arguments
			let argumentsList = argumentsToArray(arguments);
			let functionName = argumentsList.shift();

			// Cached
			let cache = getObjectAttatchedCache(configuration.reactiveStructuresAsCausalityObjects ? this : this.const, "_cachedCalls", functionName);
			let functionCacher = getFunctionCacher(cache, argumentsList);

			if (functionCacher.cacheRecordExists()) {
				let cacheRecord = functionCacher.getExistingRecord();
				cacheRecord.directlyInvokedByApplication = false;
				state.contextsScheduledForPossibleDestruction.push(cacheRecord);
			}

			// Re cached
			cache = getObjectAttatchedCache(this, "_reCachedCalls", functionName);
			functionCacher = getFunctionCacher(cache, argumentsList);

			if (functionCacher.cacheRecordExists()) {
				let cacheRecord = functionCacher.getExistingRecord();
				cacheRecord.directlyInvokedByApplication = false;
				state.contextsScheduledForPossibleDestruction.push(cacheRecord);
			}
		}

		/************************************************************************
		 *
		 *  Splices
		 *
		 ************************************************************************/

		function differentialSplices(previous, array) {
			let done = false;
			let splices = [];

			let previousIndex = 0;
			let newIndex = 0;

			let addedRemovedLength = 0;

			let removed;
			let added;

			function add(sequence) {
				let splice = {type:'splice', index: previousIndex + addedRemovedLength, removed: [], added: added};
				addedRemovedLength += added.length;
				splices.push(splice);
			}

			function remove(sequence) {
				let splice = {type:'splice', index: previousIndex + addedRemovedLength, removed: removed, added: [] };
				addedRemovedLength -= removed.length;
				splices.push(splice);
			}

			function removeAdd(removed, added) {
				let splice = {type:'splice', index: previousIndex + addedRemovedLength, removed: removed, added: added};
				addedRemovedLength -= removed.length;
				addedRemovedLength += added.length;
				splices.push(splice);
			}

			while (!done) {
				while(
				previousIndex < previous.length
				&& newIndex < array.length
				&& previous[previousIndex] === array[newIndex]) {
					previousIndex++;
					newIndex++;
				}

				if (previousIndex === previous.length && newIndex === array.length) {
					done = true;
				} else if (newIndex === array.length) {
					// New array is finished
					removed = [];
					let index = previousIndex;
					while(index < previous.length) {
						removed.push(previous[index++]);
					}
					remove(removed);
					done = true;
				} else if (previousIndex === previous.length) {
					// Previous array is finished.
					added = [];
					while(newIndex < array.length) {
						added.push(array[newIndex++]);
					}
					add(added);
					done = true;
				} else {
					// Found mid-area of missmatch.
					let previousScanIndex = previousIndex;
					let newScanIndex = newIndex;
					let foundMatchAgain = false;

					while(previousScanIndex < previous.length && !foundMatchAgain) {
						newScanIndex = newIndex;
						while(newScanIndex < array.length && !foundMatchAgain) {
							if (previous[previousScanIndex] === array[newScanIndex]) {
								foundMatchAgain = true;
							}
							if (!foundMatchAgain) newScanIndex++;
						}
						if (!foundMatchAgain) previousScanIndex++;
					}
					removeAdd(previous.slice(previousIndex, previousScanIndex), array.slice(newIndex, newScanIndex));
					previousIndex = previousScanIndex;
					newIndex = newScanIndex;
				}
			}

			return splices;
		}


		/************************************************************************
		 *
		 *  Merge into & forwarding/overlay
		 *
		 ************************************************************************/

		// let overlayBypass = {  // maybe useful when direct const access?
			// 'forwardsTo' : true,
			// 'removeForwarding' : true,
			// 'mergeAndRemoveForwarding' : true
		// };

		function mergeInto(source, target) {
			// console.log("merge into!!");
			if (source instanceof Array) {
				let splices = differentialSplices(target.const.target, source.const.target);
				splices.forEach(function(splice) {
					let spliceArguments = [];
					spliceArguments.push(splice.index, splice.removed.length);
					spliceArguments.push.apply(spliceArguments, splice.added); //.map(mapValue))
					target.splice.apply(target, spliceArguments);
				});
				for (property in source) {
					if (isNaN(property)) {
						target[property] = source[property];
					}
				}
			} else {
				for (property in source) {
					target[property] = source[property];
				}
			}
			return target;
		}

		function mergeOverlayIntoObject(object) {
			let overlay = object.nonForwardConst.forwardsTo;
			object.nonForwardConst.forwardsTo = object.nonForwardConst.storedForwardsTo;
			delete object.nonForwardConst.storedForwardsTo;
			mergeInto(overlay, object);
		}

		function genericMergeFrom(otherObject) {
			return mergeInto(otherObject, this);
		}

		function genericForwarder(otherObject) {
			this.const.forwardsTo = otherObject; // Note: not in use
		}

		function genericRemoveForwarding() {
			this.nonForwardConst.forwardsTo = null; // Note: not in use
		}

		function genericMergeAndRemoveForwarding() {
			mergeOverlayIntoObject(this);
		}

		/************************************************************************
		 *
		 *  Projection (continous creation and infusion)
		 *
		 *  TODO: Deal with zombie objects that is already forwarding... 
		 *
		 ************************************************************************/

		function genericReCacheInCacheFunction() {
			let argumentsArray = argumentsToArray(arguments);
			if (inReCache() > 0) {
				return this.const.reCached.apply(this, argumentsArray);
			} else {
				let functionName = argumentsArray.shift();
				return this[functionName].apply(this, argumentsArray);
			}
		}

		function genericReCacheFunction() {
			// console.log("call reCache");
			// Split argumentsp
			let argumentsList = argumentsToArray(arguments);
			let functionName = argumentsList.shift();
			let cache = getObjectAttatchedCache(this, "_reCachedCalls", functionName);
			let functionCacher = getFunctionCacher(cache, argumentsList);

			if (!functionCacher.cacheRecordExists()) {
				// console.log("init reCache ");
				let cacheRecord = functionCacher.createNewRecord();
				cacheRecord.independent = true; // Do not delete together with parent

				cacheRecord.cacheIdObjectMap = {};
				cacheRecord.remove = function() {
					functionCacher.deleteExistingRecord();
					cacheRecord.micro.remove(); // Remove recorder
				};

				// Is this call non-automatic
				cacheRecord.directlyInvokedByApplication = noContext();

				// Never encountered these arguments before, make a new cache
				enterContext('reCache', cacheRecord);
				state.nextIsMicroContext = true;
				getSpecifier(cacheRecord, 'contextObservers').removedCallback = function() {
					state.contextsScheduledForPossibleDestruction.push(cacheRecord);
				};
				cacheRecord.repeaterHandler = repeatOnChange(
					function () {
						cacheRecord.newlyCreated = [];
						let newReturnValue;
						// console.log("better be true");
						// console.log(inReCache());
						newReturnValue = this[functionName].apply(this, argumentsList);
						// console.log(cacheRecord.newlyCreated);

						// console.log("Assimilating:");
						withoutRecording(function() { // Do not observe reads from the overlays
							cacheRecord.newlyCreated.forEach(function(created) {
								if (created.nonForwardConst.forwardsTo !== null) {
									// console.log("Has overlay, merge!!!!");
									mergeOverlayIntoObject(created);
								} else {
									// console.log("Infusion id of newly created:");
									// console.log(created.const.cacheId);
									if (created.const.cacheId !== null) {

										cacheRecord.cacheIdObjectMap[created.const.cacheId] = created;
									}
								}
							});
						}.bind(this));

						// See if we need to trigger event on return value
						if (newReturnValue !== cacheRecord.returnValue) {
							cacheRecord.returnValue = newReturnValue;
							notifyChangeObservers(cacheRecord.contextObservers);
						}
					}.bind(this)
				);
				leaveContext();
				registerAnyChangeObserver(cacheRecord.contextObservers);
				return cacheRecord.returnValue;
			} else {
				// Encountered these arguments before, reuse previous repeater
				let cacheRecord = functionCacher.getExistingRecord();
				registerAnyChangeObserver(cacheRecord.contextObservers);
				return cacheRecord.returnValue;
			}
		}


		/************************************************************************
		 *
		 *  Block side effects
		 *
		 ************************************************************************/

		/**
		 * Block side effects
		 */
		function withoutSideEffects(action) {
			// enterContext('block_side_effects', {
			//    createdObjects : {}
			// });
			let restriction = {};
			state.sideEffectBlockStack.push({});
			state.writeRestriction = restriction
			let returnValue = action();
			// leaveContext();
			state.sideEffectBlockStack.pop();
			if (state.sideEffectBlockStack.length > 0) {
				state.writeRestriction = state.sideEffectBlockStack[state.sideEffectBlockStack.length - 1];
			}
			return returnValue;
		}
		
		
		 
		/************************************************************************
		 *
		 *   Object activity list
		 *
		 ************************************************************************/
		 
		let activityListFirst = null; 
		let activityListLast = null; 
		let activityListFilter = null;
		
		function setActivityListFilter(filter) {
			activityListFilter = filter;
		}
		
		function getActivityListFirst() {
			return (activityListFirst !== null) ? activityListFirst.const.object : null;
		}
		
		function getActivityListLast() {
			return (activityListLast !== null) ? activityListLast.const.object : null;
		}

		function getActivityListPrevious(object) {
			return object.const.handler.activityListPrevious;
		}

		function getActivityListNext(object) {
			return object.const.handler.activityListNext;
		}
		
		function pokeObject(object) {
			let tmpFrozen = activityListFrozen;
			activityListFrozen = 0;
			registerActivity(object.const.handler);
			activityListFrozen = tmpFrozen;
		}

		function removeFromActivityList(proxy) {
			if (trace.basic) log("<<< removeFromActivityList : "  + proxy.const.name + " >>>");
			removeFromActivityListHandler(proxy.const.handler);
		}
		
		let activityListFrozen = 0;
		function freezeActivityList(action) {
			activityListFrozen++;
			action();
			activityListFrozen--;
		}
		
		function stacktrace() { 
			function st2(f) {
				return !f ? [] : 
					st2(f.caller).concat([f.toString().split('(')[0].substring(9) + '(' + f.arguments.join(',') + ')']);
			}
			return st2(arguments.callee.caller);
		}
		
		function logActivityList() {
			activityListFrozen++;
			state.blockingInitialize++;
		
			let current = activityListFirst;
			let result = "[";
			let first = true;
						// log("activityList: ");
			while(current !== null && typeof(current) !== 'undefined') {
				if (!first) {
					result += ", ";
				}
				result += current.const.name;
				// current = current.activityListPrevious;
				current = current.activityListNext;
				first = false;
			}
			
			log(result + "]");
			
			state.blockingInitialize--;
			activityListFrozen--;
		}
		
		function registerActivity(handler) {
			// log("registerActivity");
			if (activityListFrozen === 0 && activityListFirst !== handler ) {
				// log("here");
				activityListFrozen++;
				state.blockingInitialize++;
				
				if (activityListFilter === null || activityListFilter(handler.const.object)) {
					// log("here2");
								
					if (trace.basic) {
						// stacktrace();
						// throw new Error("see ya");
						log("<<< registerActivity: "  + handler.const.name + " >>>");
						// log(activityListFilter(handler.const.object));
					}
					logGroup();
					// log(handler.target);
					// Init if not initialized
					if (typeof(handler.activityListNext) === 'undefined') {
						handler.activityListNext = null;
						handler.activityListPrevious = null;
					}
					
					// Remove from wherever it is in the structure
					removeFromActivityListHandler(handler);

					// Add first
					handler.activityListPrevious = null;
					if (activityListFirst !== null) {
						activityListFirst.activityListPrevious = handler;
						handler.activityListNext = activityListFirst;
					} else {
						activityListLast = handler;
					}
					activityListFirst = handler;				
					
					if (trace.basic) logActivityList();
					logUngroup();
				}
				
				state.blockingInitialize--;
				activityListFrozen--;
			}
		}
		
		function removeFromActivityListHandler(handler) {
			// Remove from wherever it is in the structure
			if (handler.activityListNext !== null) {
				handler.activityListNext.activityListPrevious = handler.activityListPrevious;
			}
			if (handler.activityListPrevious !== null) {
				handler.activityListPrevious.activityListNext = handler.activityListNext;
			}
			if (activityListLast === handler) {
				activityListLast = handler.activityListPrevious;
			}
			if (activityListFirst === handler) {
				activityListFirst = handler.activityListNext;
			}
			handler.activityListNext = null;
			handler.activityListPrevious = null;
		}
		
		
		/************************************************************************
		 *
		 *  Debugging
		 *
		 ************************************************************************/
		 
		function getInPulse() {
			return state.inPulse;
		}
		
		/************************************************************************
		 *
		 *  Module installation and configuration
		 *
		 ************************************************************************/

		
		// Language extensions
		let languageExtensions = {
			// Object creation and identification
			create : create,
			c : create,
			isObject: isObject,
			
			// Security
			canRead : canRead, // TODO: change to allow read/write?
			canWrite : canWrite, // TODO: change to allow read/write?
			
			// Reactive primitives
			uponChangeDo : uponChangeDo,
			repeatOnChange : repeatOnChange,
			repeat: repeatOnChange,
			getObjectAttatchedCache : getObjectAttatchedCache,
			callAndCacheForUniqueArgumentLists : callAndCacheForUniqueArgumentLists, 
			
			// Global modifiers
			withoutSideEffects : withoutSideEffects,
			assertNotRecording : assertNotRecording,
			withoutRecording : withoutRecording,
			withoutNotifyChange : nullifyObserverNotification,
			withoutEmittingEvents : withoutEmittingEvents,
			disableIncomingRelations : disableIncomingRelations,
			blockInitialize : blockInitialize,
			
			// Pulses and transactions
			pulse : pulse, // A sequence of transactions, end with cleanup.
			transaction: transaction, // Single transaction, end with cleanup. 	
			
			// Incoming images
			forAllIncoming : forAllIncoming,
			getIncomingReferences : getIncomingReferences,
			getIncomingReferencesMap : getIncomingReferencesMap,
			getSingleIncomingReference : getSingleIncomingReference, 
			createArrayIndex : createArrayIndex,
			setIndex : setIndex,
			isIncomingStructure : isIncomingStructure
		}
		
		// Debugging and testing
		let debuggingAndTesting = {
			observeAll : observeAll,
			cachedCallCount : cachedCallCount,
			clearRepeaterLists : clearRepeaterLists,
			resetObjectIds : resetObjectIds,
			getInPulse : getInPulse,
			trace : trace
		}
			
		/**
		 *  Module installation
		 * @param target
		 */
		function install(target) {
			if (typeof(target) === 'undefined') {
				target = (typeof(global) !== 'undefined') ? global : window;
			}

			Object.assign(target, languageExtensions);
			Object.assign(target, debuggingAndTesting);
			return target;
		}

		
		let causalityInstance = {
			state : state,
			
			// Install causality to global scope. 
			install : install,
			addClasses : addClasses,
			assignClassNamesTo : assignClassNamesTo,
			classRegistry : classRegistry, 
			
			// Setup. Consider: add these to configuration instead? 
			addPostPulseAction : addPostPulseAction,
			setCustomCanRead : setCustomCanRead,
			setCustomCanWrite : setCustomCanWrite,
			addRemovedLastIncomingRelationCallback : addRemovedLastIncomingRelationCallback,
			
			// Id expressions
			isIdExpression : isIdExpression, 
			idExpression : idExpression, 
			extractIdFromExpression : extractIdFromExpression,
			transformPossibleIdExpression : transformPossibleIdExpression,
			
			// Activity list interface
			logActivityList : logActivityList,
			freezeActivityList : freezeActivityList,
			setActivityListFilter : setActivityListFilter,
			getActivityListLast : getActivityListLast,
			getActivityListFirst : getActivityListFirst,
			getActivityListNext : getActivityListNext,
			getActivityListPrevious : getActivityListPrevious,
			pokeObject : pokeObject,
			removeFromActivityList : removeFromActivityList
		}
		Object.assign(causalityInstance, languageExtensions);
		Object.assign(causalityInstance, debuggingAndTesting);
		return causalityInstance;
	}
	
	
	function sortedKeys(object) {
		let keys = Object.keys(object);
		keys.sort(function(a, b){
			if(a < b) return -1;
			if(a > b) return 1;
			return 0;
		});
		let sortedObject = {};
		keys.forEach(function(key) {
			sortedObject[key] = object[key];
		});
		return sortedObject;
	}
	
	function getDefaultConfiguration() {
		return {
			// Main feature switch, turn off for performance! This property will be set automatically depending on the other settings.
			activateSpecialFeatures : false, 
						
			// Special features
			useIncomingStructures : false,
			incomingStructureChunkSize: 500,
			incomingChunkRemovedCallback : null,
			incomingStructuresAsCausalityObjects: false, // implies events will be on an incoming structure level as well. 
			incomingReferenceCounters : false, 
			blockInitializeForIncomingStructures: false, 
			blockInitializeForIncomingReferenceCounters: false,
			
			reactiveStructuresAsCausalityObjects: false, 
			
			objectActivityList : false,
			recordPulseEvents : false
		}
	}
	
	let configurationToSystemMap = {};
    return function(requestedConfiguration) {
		if(typeof(requestedConfiguration) === 'undefined') {
			requestedConfiguration = {};
		}
		
		// Create configuration 
		let defaultConfiguration = getDefaultConfiguration();
		Object.assign(defaultConfiguration, requestedConfiguration);
		let anySet = false;
		for (property in defaultConfiguration) {
			anySet = (defaultConfiguration[property] === true) || anySet;
		}
		if (anySet) {
			defaultConfiguration.activateSpecialFeatures = true;
		}
		
		// Create configuration signature
		let configuration = sortedKeys(defaultConfiguration);
		let signature = JSON.stringify(configuration);
		// console.log("================= REQUEST: ==========");
		// console.log(signature);
		
		if (typeof(configurationToSystemMap[signature]) === 'undefined') {
			configurationToSystemMap[signature] = createCausalityInstance(configuration);
		}
		return configurationToSystemMap[signature];
	};	
}));
