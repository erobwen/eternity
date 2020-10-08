# Eternity
Reactive object-database technology.


## Reactive database

Eternity is a reactive object oriented database that features transactions and two phase commits. 

Eternity currently piggybacks on top of MongoDB. Even though it works using MongoDB under the hood, it uses a rather different interface towards your application, so in a sense, it is a completley different database than using MongoDB.

Eternity offers a new way to access your data. Traditionally, this is done by queries and updates, but in a reactive object oriented database, the writing is done transparently. The loading of data is done on an object/data structure level by a special set of commands, which is whileLoaded, loadAndPin and unpin. 

Eternity is an extension of causalityjs. A package for reactive programming. So every feature that is available in causalityjs is available in eternity. It is therefore strongly recommended to have a look into what that library has to offer.  

## Usage

Installation using npm:

	npm install eternity

To create an instance of Eternity, simply use 

	import eternity;
	const persistentWorld = eternity.getWorld({ ... configuration});  

Now you have a persistent world that works similar to the worlds of causality, but with added features for persisting data in a database. 


## The create function

For eternity to work, new objects you create and intend for storage, needs to be created using the create function

	const create = persistentWorld.create;
	const objectA = create(new SomeClass()); // Class object
	const objectB = create({}); // Plain object
	const objectC = create([]); // An array

The reason is that eternity now creates an ES6 proxy out of your object, so that it can monitor any change in it and store those changes in the database. 


## The persistent object

Access to your data is done by a special persistent object that is the root of all data stored in your database. You can write data directly to the persistent object, but typically you would have it refer to other objects and data structures that hold the actual data. You can access the persistent using the world object.

	const persistent = persistentWorld.persistent;
	persistent.messageToDatabase = "Hello World"; 

The lines above stores the string "Hello World" in your database. 


## Writing

Writing is transparent, which means that an object that resides on the database, will be automatically updated when its counterpart in memory is changed. It also means that new objects can be persisted by just having the persistent object, or another already persisted object refer to them.  

	const persistent = persistentWorld.persistent;
	persistent.mySingleEmployee = create(new Employee("Bob"));
	persistent.mySingleEmployee.salary += 100; // Raise salary by a hundred. 

All of the above changes will be pushed gradually to the database, but the memory image of persistent will of course be instantly changed. 

There is also a transaction command group together changes, and in addion, make it possible to wait for when the transaction has been safley written down in the database, if that is of importance.  

	const { persistent, transaction } = persistentWorld.persistent;
	transaction(() => {
		// Move all money from one account to the other
		persistent.accountA += persistent.accountB;
		persistent.accountB = 0; 
	})

		.then(() => {
			console.log("Data now written safely to database!");
		});
 
The above code now means that in the case of a power-out or hardware failure, either all or none of the changes inside the transaction will go through. This means that if used correctly, eternity can gurarantee a certain degree of data consistency in the database. 

Note: You are not allowed to have an async function inside the transaction with waiting. This typically means that all loading has to be done before the transaction starts, and the whole transaction then needs to be executed in one go.

## Reading

Objects in eternity have one of three state loaded, placeholder or database only. 

1. When an object is loaded its content is in synch with what is persistently stored in the database, except from when the object was just modified, and the changes has not yet propagated down into the database. A loaded object has the property loaded set to true for the application to verify its state. A loaded object can refer to other objects that are either placeholders or other loaded objects.

2. If an object is a placeholder, it is void from actual content and its loaded property is set to false. The main purpose of a placeholder object, is so that other objects may refer to it and that several objects that refer to the same persistent object can refer to the same placeholder. So, essentially, the only sensible thing you can do with a placeholder is either to load it, or to use the === operator on it. Attempting to modify a non-loaded will result in an exception.

3. If an object is in the database only, there is no actual Javascript that correspond to that particular object in the database.

It is worth noting that the persistent object itself is allways loaded.  

A non loaded object can be loaded with the load function, but to ensure that the object remains loaded, we need to pin it as well. An object that is pinned by one or more pins, will not be unloaded by the system. Because of this the two functions to load the needed data is loadAndPin and unpin. 

	loadAndPin(object);
	object.doSomething(); // Object is guaranteed to be loaded here.
	unpin(object);

When an object has no more pins, it can be unloaded, and eventually, its memory can be deallocated and reused for something else. Since the volatile memory capacity is typically much smaller than the persistent memory capacity, it is necessary to unpin objects to avoid running out of memory as we browse around in the database. In order to guarantee unpinning, it is more safe to use the whileLoaded function that do the pinning and unpinning automatically. 

	whileLoaded(object, () => {
		object.doSomething();
	}) 

## Indexes

Eternity takes the approach of indexes defined as objects. An index is basically an hierarchical search tree, such as a AVL-tree or a B-tree. It is often beneficial to have a reverse reference that is set on the contents of the index, to refer back upwards in the search tree. As it is, eternity offers a standard AVL search tree that can be used.   

	const { Index } = eternity;  
	const myCompany = create(new Company());
	myCompany.employees = create(new Index({
		owner: myCompany, 
		sortFunction: compareEmploymentDate, 
		reverseGetter: "getCompany"
	}));
	const firstEmployee = create(new Employee()); 
	myCompany.employees.add(firstEmployee);

The standard eternity Index class also functions as an up tree, so if we wish to access the company from a given employee, we can just type: 

	const theCompany = await firstEmployee.getCompany();

What happens, is that the index sets a reverse getter named "getCompany" on the employee, and what that getter does is to traverse up the index tree, until it reaches the owner of the index, which is then returned.    

Even though it might seem as a hassle to have to define your own indexes in the application code, there are actually some benefits to doing so: 

1. The application can easily implement specialized indexes and do not have to rely on data base providers to do so. For example, if an application is in need of some particular quad or octa trees, they can easily implement it. There can also be npm packages made for this purpose. Simply install the index class of your choice, and go with it.  

2. Indexes are first class objects, this means that they can be owned by objects, and not only tables, or objects of a certain kind, as would be the case with indexes in a traditional SQL database. 

3. Indexes are tree structures, this means that they can be partially loaded or traversed in any way you want using the load functions. It also becomes possible to share and synchronize index nodes across a network.


## Incoming and outgoing references limit

There is a caveat to all of this. For various reasons, there is a hard limitations on how many incoming persistent references an object is allowed to have. The specific value of this limitation can be set in the configuration, but typically an object is assumed to have no more than 50 incoming references and 50 outgoing references. 

There are two reasons for this limitation: 

1. If we build object structures in a database, we want to encourage data structures that are traversable in both directions without creating a need for huge arrays. For example, if we have hundred thousands of employee objects that refer to the same company object, there would be no way to list all employees for that company, and if we put all of the employees in a huge array with potentially hundred thousands of items, that list would have to load all in one chunk, creating a too coarse loading granularity. So to build a data structure that works properly where you have a one to many relation, it is recommended to build a search tree that simultaneously works as an up-tree. If you do this, you will have no problems confining to the reference count limitations.

2. The persistent garbage collector needs to store all reverse references in the system for its reconnect phase. As it currently works, it stores them directly in the object and it would not work if a single object had hundreds of thousands of incoming references. There are ways to implement the system so that more incoming references can be handled, but because of reason 1, it is probably not a good idea to support it anyway.     


## Reactive object oriented databases (ROOD) compared to conventional databases, summary

Eternity is a reactive object oriented database ROOD, and compared to most conventional databases (SQL databases), including most popular no-SQL databases (MongoDB, Neo4J etc.), it works quite differently and has its advantages and dissadvantages. 

### Advantages of ROOD

ROOD is great for browsing data structures such as acyclic or cyclic graphs. When a loadAndPin command is run, the existing data structures are extended with more placeholders and loaded objects, this stand in contrast to conventional databases where the result of consequtive queries are unrelated and unconnected. This makes ROOD exceptionally suitable to store geographical data or computer game worlds, that are typically browsed gradually.

Also, with ROOD there is no need for explicit saving of data. When data is modified, it will be automatically saved!

ROOD is excellent as a base for setting up an isomorphic full stack data binding, where objects on the client directly correspond to objects on the server and the database, and where all changes are propagated automatically between client/server and peer clients. The reason for this is that objects on the server has a direct correspondance to objects in the database, and also that the loadAndPin command can be mirrored on the client as well. 

### Dissadvantages of ROOD

What comes less natural for ROOD is searching and queries, where a large set of data is queried for a selection of data records. Even though it is possible to have an iterator explicitly iterate over an index structure and store its result in some temporary result data structure, this technology starts from scratch. You can no longer use any existing query language that has matured for other data bases. 

Also, it has to be said that there is something inherently non-reactive with queries in itself. A query to a database generally generates a result. But as data gradually change in the database, for how long is that result even correct? The result might even be outdated as it is read by the recipient of the reply. A solution more true to reactive programming, would construct an index when organizing data, and as data change, directly update that index. 

Searching and reactive index maintaining is a topic that is in need of more future research.     

## Persistent Garbage Collection

### Reconnect Garbage Collector Algorithm 

The working principles of the garbge collector is: Local Disconnect, Reconnect, Clear and Deallocate. It works  fundamentally different from traditional GC algorithms such as Mark & Sweep, and is especially designed to work with persistent memory, where only a small part of the data can be loaded at one given moment and where the application code may change data at any time during the algorithm is running. It is also designed to work incrementally in steps of constant size. The algorithm is based on the concept of inverse references, where the database is set up so that for every reference it stores, a specially encoded inverse reference is stored.  

### The algorithm works as follows:

1. The object structures in the data graphs all have a common ancestor that is a specific persistent object, henceforth called THE  ersistent object.

2. As data is added to the database, a spanning tree is constructed, where the persistent object is the root. The spanning tree is formed out of a subset of all references in the data base. The parent of an object in this spanning tree is called the persistent parent. 

3. Whenever data is disconnected from it parent in this spanning tree, the  procedure of disconnection begins. All children of the detached root are iterated and disconnected, meaning its reference to its persistent parent is removed. However, they are stored in a linked list for further processing (toBeReattachedList). 

4. When there are no more objects to disconnect, all disconnected objects are iterated once more (using toBeReattachedList), but 
this time we examine their incoming references, to see if one of them is a reference from a non disconnected node. 
If so, then reconnection starts. This is only possible since the system stores inverse references on every object.
Objects that have no incoming references from non disconnected objects are stored in another list (unableToReattachList)
for further processing. 

5. During reconnection, the spanning tree expands into the disconnected objects, that now become connected. The 
reconnection phase has priority over disconnection, meaning we reconnect everything we can reconnect as soon as possible.
Note that if a reconnected object is in toBeReattachedList or unableToReattachList it is then removed from that list upon 
reconnection.

6. If there is nothing more to reconnect, and nothing more to disconnect, the algorithm then proceeds into clearing mode. 
All objects of unableToReattachList are iterated, and each object are cleared of any data, marked with
clearedByGarbageCollector = true, for the application to see, and it is also write protected.

7. When an object has been cleared, and its outgoing and incoming reference counter is 0, it is deallocated. When this happens, the application 
 object corresponding to the data base object is marked as non-persistent. Since there are no more incoming references, the data base
 ID used by the deallocated object, can instantly be reused by a new object. (note: The code for this part of the algorithm can be found in 
 eternity.js)


### Application Interaction: 

It is assumed that during the whole process, application code might modify any object that is a part of the process:

a) Application code might reconnect disconnected objects, this immediatley starts the process of reconnection. 

b) Application code might connect disconnected objects with new data structures. In this situation it is important to continue
the cascading disconnection into the new data structures.    

c) If an object has been cleared but still not deallocated, it is write protected as long as it is not reconnected to 
the persistent spanning tree by the application.  


### Object clearing destructive property: 

It is important to note that the garbage collector will clear any object that the garbage collector is unable to reconnect. Therefore, 
once data is stored persistently, there is no way to "get it back" to being just non persistent. For example: 

let x = myDataStructure(); // The data structure x is now just in memory, not persistent.

	// Store x persistently. 
	persistent.x = x;

	// Remove x from persistent storage 
	delete persistent.x;

	// wait on gc to complete...

	// x (the variable) is now an empty object. the original data structure no longer exists, not even in memory.

So, if you have a persistent data structure that you wish to retreive back into memory and then remove from persistent 
storage, the only way you can safely do it is through explicit data structure copying BEFORE you disconnect it. 


### Dividing the work into parts:

The algorithm can be modified using a list (justDetatchedByApplicationList) to keep track of nodes that just got detatched 
by application. This way we can run steps 1-7 for an object detatched by the application, before we do the same for the next
object detatched by the application. This way we can complete the collection process in one area of the data base, 
while there are still detatchments waiting for processessing in an other area of the database. This makes it possible to reuse
deallocated object space earlier, meaning decreased time to delivery. However, in the case where consequtive disconnects are in fact
adjacent to each other, and influence each other, the over all efficiency of the algorithm will go down as individual objects 
might go through several phases of disconnect/reconnect before the algorithm terminates. 


### About this algorithm: 

This algorithm was invented by the author of this package, to my knowledge I dont know if this approach has been 
attempted by any one else. 

There are other, quite different, attemts to construct a garbage collector for object data bases, such as: 

https://www.researchgate.net/publication/220473696_Garbage_Collection_in_Object-Oriented_Databases_Using_Transactional_Cyclic_Reference_Counting. 





