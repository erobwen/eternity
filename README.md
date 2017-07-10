# Eternity
Reactive database technology.

## Reference anatomy
This is an image of the reference anatomy in eternity. The system is based on the following premises: 

1. If an object is loaded, then it is fully loaded. This is to create a sensible object synchronization between database, server memory and client memory. 
2. As a consequence of 1,an object needs to be of reasonable size. An object cannot have million keys, and an array cannot have millions element. 
3. However, we can and should allow unlimited incoming references to any given object. These can be iterated asynchronously in conjunction with observing changes in incoming references. 
4. In the database, all incoming references are stored with a back-reference. This is in order to: 
* to make the asynchronous iteration possible.
* Make incremental persistent garbage collection possible
5. The important thing about index structures, is that they do not have any incoming references inbetween them, and incoming references point past the index structure.

So, out of these requirements, a reference anatomy is derrived as the following picutre shows:

![Alt text](/documents/reference_anatomy.png?raw=true "Reference Anatomy")

The reference structure has some similarity with the synapses of neural network. 

Sometimes certain parts of this model can be left out, for example, there might not be a need for an index.

From left to right we search, from rigth to left we enumerate (potentially asynchronously). 

From left to right we find objects of the right quality. From right to left we find objects of quantity.


## Indexes

Eternity takes the approach of user defined indexes defined as objects. An index is basically an hierarchical data structure, typically a B-tree. 

Since indexes are ordinary object tree structures, they fit into the reactive paradigm of liquid/causality. Index nodes can be shared across the network and synchronized in realtime. 

This is to promote the reactive paradigm for databases. In conventional database technology, we send a query to a data base and retrieve a stream of results. However, this instantly breaks the reactive paradigm, as the read parts of a stream cannot be updated. Instead, to promote a 100% reactive paradigm, we build and share index structures that can be browsed in realtime by all subscribers to that structure. 


### Indexes as objects 

In conventional database-technology indexes is a per-database concept. A certain database can for example hold a handful of indexes, related to some table. In eternity, an index is an object, and can thus be owned by a single object.   
