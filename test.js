const fs = require('fs');

const content = 'Some content!';

var stream = fs.createWriteStream("test.txt");
stream.on('error', console.error);

var x = "hello"
// for(var i = 0; i < 6; i++)
// stream.write(`blah blah ${x}` + '\n');
// stream.end();


async function fetchProducts() {
    try {
      // after this line, our function will wait for the `fetch()` call to be settled
      // the `fetch()` call will either return a Response or throw an error
      const response = await fetch(
        "https://mdn.github.io/learning-area/javascript/apis/fetching-data/can-store/products.json",
      );
      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }
      // after this line, our function will wait for the `response.json()` call to be settled
      // the `response.json()` call will either return the parsed JSON object or throw an error
      const data = await response.json();
      stream.write(`blah blah ${x}` + '\n');
      console.log(data[0].name);
    } catch (error) {
      console.error(`Could not get products: ${error}`);
    }
  }
  
  fetchProducts();