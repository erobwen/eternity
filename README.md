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

So, out of these requirements, a reference anatomy is derrived as the following picutre shows:

![Alt text](/documents/reference_anatomy.png?raw=true "Reference Anatomy")

The important thing about index structures, is that they do not have any incoming references inbetween them, and incoming references point past the index structure.