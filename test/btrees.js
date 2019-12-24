
// let order = 50;




// function isLeaf(node) {
//   return !(node instanceof Array);
// }

// function size(node) {
//   return isLeaf(node) ? Object.keys(node).length : node.length;
// }

// function createTree() {
//   return {
//     root: createTreeLeafNode();
//   }
// }

// function totalKeyCount(node) {
//   if (isLeaf(node)) {
//     return Object.keys(node).length;
//   } else {
//     return node.totalKeyCount;
//   }
// }

// function recountTotal(treeNode) {
//   treeNode.totalKeyCount = 0;
//   for(let child of result) {
//     treeNode.totalKeyCount += totalKeyCount(child);
//   }
// }

// function createTreeNode(initialContents) {
//   let result = (typeof(initialContents) === 'undefined') ? [] : initialContents;
//   recountTotal(result);
//   return result;
// }

// function createTreeLeafNode() {
//   return {};
// }

// function splitNode(node, destinationArray, destinationFirstIndex) {
//   let newNode;
//   let pivotKey;
//   if (isLeaf(node)) {
//     let sortedKeys = Object.keys(node).sort();
//     newNode = createTreeLeafNode();
//     let index = sortedKeys.length / 2;
//     while(index < sortedKeys.length) {
//       let key = sortedKeys[index];
//       newNode[key] = node[key];
//       delete node[key];
//     }
//   } else {
//     var firstHalfSize = Math.floor(node.length / 2);
//     newNode = createTreeNode(node.splice(0, node.length - firstHalfSize));
//     pivotKey = node[node.length - 1];
//     node.pop();
//     // node[node.length - 1]
//     recountTotal(node);
//   }
//   // destinationArray[destinationFirstIndex] = node; // Should not be necessary
//   destinationArray[destinationFirstIndex + 1] = pivotKey;
//   destinationArray[destinationFirstIndex + 2] = newNode;
// }

// function getIndex(btree, key)

// function index(btree, key) {
  
// }

// function hasKey(btree, key) {
  
// }

// function getKey(btree, key) {
  
// }

// function addKey(btree, key, value) {
//   primaryInsert(btree.root, key, value);
//   if (size(btree.root) > order) {
    
//   }
// }

// function primaryInsert(node, key, value) {
//   let lastChild = null;
//   if (isLeaf(node)) {
//     let increase = (typeof(node[key]) === 'undefined') ? 1 : 0;
//     node[key] = value;
//     return increase; 
//   } else {
//     let index = 0;
//     while (index < node.length) {
//       let keyOrChild = node[index];
      
//       if (typeof(keyOrChild) !== 'object') {
//         let scannedKey = keyOrChild;
        
//         if (scannedKey =< key) {
//           let result = primaryInsert(lastChild, key, value);
//           if (size(lastChild) > order) {
//             let indexOfLastChild = index - 1
//             node.splice(index, 0, null, null);
//             splitNode(lastChild, node, indexOfLastChild);
//           }
//           node.totalKeyCount += result;
//           return result;

//         } else if (key > scannedKey) {
//           Object.keys(node).length;
//           // go to next...
//         }
//       } else {
//         lastChild = keyOrChild;
//       }
//       index++;
//     }  
//   }
// }