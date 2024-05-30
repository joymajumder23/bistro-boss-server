const express = require('express');
const app = express();
const cors = require('cors');
var jwt = require('jsonwebtoken');
require('dotenv').config();
const stripe = require("stripe")(process.env.STRIPE_SCRETE_KEY);
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5000;

// middlewares
app.use(express.json());
app.use(cors());



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.xxoesz5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const menuCollection = client.db("bistroDB").collection("menu");
    const cartCollection = client.db("bistroDB").collection("carts");
    const userCollection = client.db("bistroDB").collection("users");
    const paymentCollection = client.db("bistroDB").collection("payments");

    // jwt related api
    app.post('/jwt', async (req, res) => {
      console.log(req.headers);
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      res.send({ token });
    })

    // custom middlewares
    const verifyToken = (req, res, next) => {

      // next();
      if (!req.headers.authorization) {
        // console.log('inside verify token', req.headers);
        console.log('inside verify token', req.headers.authorization);
        return res.status(401).send({ message: 'forbidden access' });
      }
      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'forbidden access' });
        }
        req.decoded = decoded;
        next();
      })
    }

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === 'admin';

      if (!isAdmin) {
        return req.status(403).send({ message: 'forbidden access' });
      }
      next();
    }

    app.get('/menu', async (req, res) => {
      const result = await menuCollection.find().toArray();
      res.send(result);
    })

    app.post('/menu', verifyToken, verifyAdmin, async (req, res) => {
      const item = req.body;
      const result = await menuCollection.insertOne(item);
      res.send(result);
    })

    app.get('/menu/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: id };
      const result = await menuCollection.findOne(query);
      res.send(result);
    })

    app.get('/menu/:id', async (req, res) => {
      const item = req.body;
      const id = req.params.id;
      const filter = { _id: id };
      const updatedDoc = {
        $set: {
          name: item.name,
          category: item.category,
          price: item.price,
          recipe: item.recipe,
          image: item.image
        }
      }
      const result = await menuCollection.updateOne(filter, updatedDoc);
      res.send(result);
    })

    app.get('/carts', async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    })

    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    })

    app.get('/users/admin/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'unauthorized access' });
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);

      let admin = false;
      if (user) {
        admin = user?.role === 'admin';
      }
      res.send({ admin });
    })

    app.post('/carts', async (req, res) => {
      const newCart = req.body;
      const result = await cartCollection.insertOne(newCart);
      res.send(result);
    })

    app.post('/users', async (req, res) => {
      const newUser = req.body;
      const query = { email: newUser.email };
      const isExisting = await userCollection.findOne(query);
      if (isExisting) {
        return res.send({ message: 'user already exists', insertedId: null });
      }
      const result = await userCollection.insertOne(newUser);
      res.send(result);
    })

    app.patch('/users/admin/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: 'admin'
        }
      }
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);
    })

    app.delete('/carts/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    })

    app.delete('/users/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    })

    app.delete('/menu/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: id } || { _id: new ObjectId(id) };
      const result = await menuCollection.deleteOne(query);
      res.send(result);
    })

    // payment intent
    app.post('/create-payment-intent', async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      });
      res.send({
        clientSecret: paymentIntent.client_secret
      });
    })

    // payment history data loaded by user email
    app.get('/payments/:email', async (req, res) => {
      const query = { email: req.params.email };
      // if(query !== req.decoded.email){
      //   return res.status(403).send({message: 'forbidden access'});
      // }
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
      console.log(result);
    })

    // payment api
    app.get('/payments', async (req, res) => {
      const result = await paymentCollection.find().toArray();
      res.send(result);
    })

    app.post('/payments', async (req, res) => {
      const payment = req.body;
      const result = await paymentCollection.insertOne(payment);

      // carefully delete each item from the cart
      const query = {
        _id: {
          $in: payment.cartId.map(id => new ObjectId(id))
        }
      };
      const deleted = await cartCollection.deleteMany(query);
      res.send(result, deleted);
    })

    // stats or analytics
    app.get('/admin-stats', async (req, res) => {
      const users = await userCollection.estimatedDocumentCount();
      const menuItem = await menuCollection.estimatedDocumentCount();
      const order = await paymentCollection.estimatedDocumentCount();

      // this is not the best way
      // const payments = await paymentCollection.find().toArray();
      // const revenue = payments.reduce((total, payment) => total + payment.price, 0);

      // this is best way
      const result = await paymentCollection.aggregate([{
        $group: {
          _id: null,
          totalRevenue: {
            $sum: '$price'
          }
        }
      }]).toArray();

      const revenue = result.length > 0 ? result[0].totalRevenue : 0;

      res.send({
        users, menuItem, revenue, order
      })
    })

    // aggregate
    app.get('/order-stats', async (req, res) => {
      const result = await paymentCollection.aggregate([
        {
          $unwind: '$menuItemCart'
        },
        {
          $lookup: {
            from: 'menu',
            localField: 'menuItemCart',
            foreignField: '_id',
            as: 'menuItems'
          }
        },
        {
          $unwind: '$menuItems'
        },
        {
          $group: {
            _id: '$menuItems.category',
            quantity: { $sum: 1 },
            revenue: { $sum: '$menuItems.price' }
          }
        },
        {
          $project: {
            _id: 0,
            category: '$_id',
            quantity: '$quantity',
            revenue: '$revenue'
          }
        }
      ]).toArray();
      res.send(result);
    })


    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);



app.get('/', (req, res) => {
  res.send('Bistro Boss is sitting');
});

app.listen(port, () => {
  console.log(`Bistro Boss is sitting on PORT ${port}`);
})