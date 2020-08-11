# Eternity
Reactive object-database technology.


## Reactive database

Eternity is offering a new way to access data in your database. Traditionally, this is done by queries and updates, but in a reactive database the writing and reading from the database is almost transparent to the application. 

### Writing
This means that an object that resides on the database, will be automatically updated when its counterpart in memory is changed. 

### Reading
In addition, objects will be loaded by a special selector command, for example `myObject.load("forEdit", action)`. When action runs, the object will be loaded according to the "forEdit" selector. A selector defines the refered objects that needs to be loaded in conjunction with myObject, and can be completley user defined. Eternity keeps a list of the least recently accessed objects, and in order to free up memory, objects at the top of the list will be automatically unloaded.

### Persistent Garbage Collection
In addition, the set of objects saved in the database will be determined by the objects transitivley refered to by a very specific "persistent node". This also means that eternity has a built in garbage-collector that will automatically remove objects from the database if they no longer can be reached by the persistent node. 

The garbage collection uses a "flamefront" algorithm to remove unused data from the database.

## Example

Any eternity object that is created can be stored, by simply refering to them, directly or indirectly, from the eternity.persistent object.  

    let create = eternity.create;
	
	// Store a and b in the database
	let a = create({});
	let b = create({});
	a.toB = b;
    eternity.persistent.toA = a;

Typically, eternity.persistent will refer to a couple of index tree structures that will refer to your objects needed for your application.  


## Eternity objects are proxies

The objects of eternity appear as normal javascript objects. The only difference is that you create them using the eternity.create function that sets up the proxies. 

## Reactive databases compared to conventional databases, summary

* Loaded data is connected in a contionous data structure instead of isolated data records.

* subscribe/notify instead of query/result

* transparent saving (memory as a cache for the database) vs explicit saving

* loading using selectors instead of load requests.

* Indexes as application managed objects as opposed to built in (DB managed) and global for each table.

* Automatic persistent storage management (garbage collection) as opposed to application driven record deletion.


## Reference anatomy
This is an image of the reference anatomy in eternity. The system is based on the following premises: 

1. If an object is loaded, then it is fully loaded. This is to create a sensible object synchronization between database, server memory and client memory. 

2. As a consequence of 1,an object needs to be of reasonable size. An object cannot have million keys, and an array cannot have millions element. 

3. In the current version, there should be a limit to the incoming references to each object.

4. In the database, all incoming references are stored with a back-reference. This is in order to make incremental persistent garbage collection possible


## Indexes

Eternity takes the approach of user defined indexes defined as objects. An index is basically an hierarchical data structure, typically a B-tree. 

Since indexes are ordinary object tree structures, they fit into the reactive paradigm of liquid/causality. Index nodes can be shared across the network and synchronized in realtime. 

This is to promote the reactive paradigm for databases. In conventional database technology, we send a query to a data base and retrieve a stream of results. However, this instantly breaks the reactive paradigm, as the read parts of a stream cannot be updated. Instead, to promote a 100% reactive paradigm, we build and share index structures that can be browsed in realtime by all subscribers to that structure. 


### Indexes as objects 

In conventional database-technology indexes is a per-database concept. A certain database can for example hold a handful of indexes, related to some table. In eternity, an index is an object, and can thus be owned by a single object.   
