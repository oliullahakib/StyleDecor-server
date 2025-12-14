const express = require('express')
require('dotenv').config()
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.PAYMENT_SECRET);
const admin = require("firebase-admin");
const serviceAccount = require("./styledecor-firebase-adminsdk.json");

const app = express()
const port = process.env.PORT || 3000

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
// middleware 
app.use(express.json())
app.use(cors())
app.get('/', (req, res) => {
  res.send('styleDecor start !')
})
// cusmont middleware 
const verifyFriebaseToken = async (req, res, next) => {
  const authorization = req.headers.authorization

  if (!authorization) {
    return res.status(401).send({ message: "unauthorize access" })
  }
  const token = authorization.split(' ')[1]

  if (!token) {
    return res.status(401).send({ message: "unauthorize access" })
  }
  try {
    const decoded = await admin.auth().verifyIdToken(token)
    req.token_email = decoded.email
    next()
  } catch (error) {
    return res.status(401).send({ message: "unauthorize access" })
  }
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.wfr9cox.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// traking id generator 
function createTrackingId() {
  const prefix = 'BDX-';
  const timestampPart = Date.now().toString(36).toUpperCase();
  const randomPart = Math.random().toString(16).substring(2, 8).toUpperCase();
  return `${prefix}${timestampPart}-${randomPart}`;
}

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const db = client.db('styleDecor')
    const packagesCollection = db.collection('packages')
    const bookingCollection = db.collection('booking')
    const paymentCollection = db.collection('payment')
    const decoratorsCollection = db.collection('decorators')
    const usersCollection = db.collection('users')
    // role middlewares
    const verifyADMIN = async (req, res, next) => {
      const email = req.token_email
      const user = await usersCollection.findOne({ email })
      if (user?.role !== 'admin'){
        return res.status(403).send({ message: 'Admin only Actions!', role: user?.role })   
      }
      next()
    }

    // user releted apis 
    app.post('/user', async (req, res) => {
      console.log(req.body)
      const newUser = req.body
      newUser.createdAt = new Date()
      newUser.role = "user"
      const result = await usersCollection.insertOne(newUser)
      res.send(result)
    })
    // get user role
    app.get('/user/role', verifyFriebaseToken, async (req, res) => {
      const result = await usersCollection.findOne({ email: req.token_email })
      res.send({ role: result?.role })
    })

    // decorator releted apis 
    // admin d
    app.get('/decorators', verifyFriebaseToken,verifyADMIN, async (req, res) => {
      const category = req.query.category
      const query = {}
      if (category) {
        query.service_type = category
        query.applyStatus = "accepted"
      }
      const result = await decoratorsCollection.find(query).toArray()
      res.send(result)
    })
    // public 
    app.get('/decorators/public', async (req, res) => {
      const result = await decoratorsCollection.find().limit(3).toArray()
      res.send(result)
    })
    app.post('/decorator', verifyFriebaseToken, async (req, res) => {
      const newDecorator = req.body
      // check the user first 
      const userExist = await decoratorsCollection.findOne({ email: newDecorator.email })
      if (userExist) {
        return res.send({ message: "You already apply" })
      }
      newDecorator.applyStatus = "pending"
      const result = await decoratorsCollection.insertOne(newDecorator)
      res.send(result)
    })
    app.delete('/decorator/:id', async (req, res) => {
      const { id } = req.params
      const query = { _id: new ObjectId(id) }
      const result = await decoratorsCollection.deleteOne(query)
      res.send(result)
    })
    app.patch('/decorator/:id', async (req, res) => {
      const { id } = req.params
      const { status, email } = req.body
      const query = { _id: new ObjectId(id) }
      const update = {
        $set: { applyStatus: status }
      }
      const result = await decoratorsCollection.updateOne(query, update)

      // update user role 
      if (status === "accepted") {
        const query = {}
        if (email) {
          query.email = email
        }
        const updateRole = {
          $set: { role: "decorator" }
        }
        const userResult = await usersCollection.updateOne(query, updateRole)
      }
      res.send(result)
    })

    // package releted apis 
    // public 
    app.get('/packages', async (req, res) => {
      const search = req.query.search
      const type = req.query.type
      let limit = parseInt(req.query.limit)
      const min = parseInt(req.query.min)
      const max = parseInt(req.query.max)
      const query = {}
      if (search) {
        const searchValue = search.toLocaleLowerCase()
        query.service_name = { $regex: searchValue, $options: "i" }
      }
      if (type) {
        query.service_category = { $regex: type, $options: "i" }
      }
      if (min, max) {
        query.cost = { $gte: min, $lte: max }
      }
      const result = await packagesCollection.find(query).limit(limit ? limit : 0).toArray()
      res.send(result)
    })

    app.get('/package/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await packagesCollection.findOne(query)
      res.send(result)
    })
    // adimn d
    app.post('/package', verifyFriebaseToken,verifyADMIN, async (req, res) => {
      const newPackage = req.body
      const result = await packagesCollection.insertOne(newPackage)
      res.send(result)
    })
    // payment releted apis 
    app.get('/my-payment-history', verifyFriebaseToken, async (req, res) => {
      const email = req.query.email
      const query = {}
      if (!email) {
        return res.send({ message: "requer email to work" })
      }
      query.payer_email = email
      const result = await paymentCollection.find(query).toArray()
      res.send(result)
    })
    app.post('/payment-checkout-session', verifyFriebaseToken, async (req, res) => {
      const packageInfo = req.body
      const { email, bookingId, name, image, cost, trakingId, packageId } = packageInfo
      const amount = parseInt(cost)
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: 'bdt',
              product_data: { name, images: [image] },
              unit_amount: amount * 100
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        customer_email: email,
        metadata: {
          bookingId,
          trakingId,
          packageId,
          service_name: name
        },
        success_url: `${process.env.YOUR_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.YOUR_DOMAIN}/dashboard/my-bookings`,
      })
      res.send(session.url)
    })

    app.patch('/payment-success', verifyFriebaseToken, async (req, res) => {
      const { session_id } = req.query
      const sessonData = await stripe.checkout.sessions.retrieve(session_id)
      console.log(sessonData)

      // check the booking first 
      const query = { transactionId: sessonData.payment_intent }
      const bookingExsit = await paymentCollection.findOne(query)
      if (bookingExsit) {
        return res.send({
          message: "Payment already complite for this booking",
          transactionId: sessonData.payment_intent,
          trakingId: bookingExsit.trakingId,
        })
      }

      // modify the booking 
      const id = sessonData.metadata.bookingId
      const trakingId = sessonData.metadata.trakingId;
      const filter = { _id: new ObjectId(id) }
      const update = {
        $set: {
          paymentStatus: sessonData.payment_status,
          trakingId,
          transactionId: sessonData.payment_intent,
          serviceStatus: "pending",
          payAt: new Date()
        }
      }
      const modifyResult = await bookingCollection.updateOne(filter, update)

      // create a transaciton history 
      const paymentInfo = {
        amount: sessonData.amount_total,
        currency: sessonData.currency,
        payer_email: sessonData.customer_email,
        packageId: sessonData.metadata.packageId,
        service_name: sessonData.metadata.service_name,
        bookingId: sessonData.metadata.bookingId,
        transactionId: sessonData.payment_intent,
        paymentStatus: sessonData.payment_status,
        payAt: new Date(),
        trakingId
      }
      const paymentResult = await paymentCollection.insertOne(paymentInfo)
      res.send({
        message: "success",
        paymentResult,
        transactionId: sessonData.payment_intent,
        trakingId,
        modifyResult
      })
    })

    // booking releted apis 
    // admin d
    app.get('/bookings', verifyFriebaseToken,verifyADMIN, async (req, res) => {
      const serviceStatus = req.query.serviceStatus
      const query = {}
      if (serviceStatus) {
        query.serviceStatus = serviceStatus
      }
      const result = await bookingCollection.find(query).toArray()
      res.send(result)
    })

    // decorator 
    app.get('/bookings/dacorator', verifyFriebaseToken, async (req, res) => {
      const serviceStatus = req.query.serviceStatus
      const email = req.query.email
      const query = {}
      if (serviceStatus !== "pending" & serviceStatus !== "assign" & serviceStatus !== "completed") {
        query.serviceStatus = { $nin: ['pending', 'assign', 'completed'] }
      } else {
        query.serviceStatus = serviceStatus
      }
      if (email) {
        query.userEmail = email
      }
      const result = await bookingCollection.find(query).sort({ date: -1 }).toArray()
      res.send(result)
    })
    app.get('/bookings/service-status', verifyFriebaseToken, async (req, res) => {
      const email = req.query.email
      const status = req.query.status
      const query = {}
      if (email) {
        query.decoratorEmail = email
      }
      if (status) {
        query.serviceStatus = status
      }
      const result = await bookingCollection.find(query).toArray()
      return res.send(result)
    })
    // user 
    app.get('/dashboard/my-bookings', verifyFriebaseToken, async (req, res) => {
      const email = req.query.email
      const sort = req.query.sort
      const limitValue = Number(req.query.limit) || 0
      const skipValue = Number(req.query.skip) || 0
      let sortValue
      const query = {}
      if (email) {
        query.userEmail = email
      }
      if (sort) {
        sortValue = sort === 'desc' ? -1 : 1 || -1
      }
      const result = await bookingCollection.find(query).limit(limitValue).skip(skipValue).sort({ date: sortValue }).toArray()
      const totalBooking = await bookingCollection.countDocuments()
      res.send({ result, totalBooking })
    })
    app.get('/booking/:id', verifyFriebaseToken, async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await bookingCollection.findOne(query)
      res.send(result)
    })
    app.post('/booking', verifyFriebaseToken, async (req, res) => {
      const newPackage = req.body
      const trakingId = createTrackingId()
      newPackage.trakingId = trakingId
      const result = await bookingCollection.insertOne(newPackage)
      res.send(result)
    })
    // admin d
    app.patch('/booking/:id', verifyFriebaseToken,verifyADMIN, async (req, res) => {
      const id = req.params.id
      const assignDecoratorInfo = req.body
      const query = { _id: new ObjectId(id) }
      const update = {
        $set: { ...assignDecoratorInfo, serviceStatus: "assign" }
      }
      const result = await bookingCollection.updateOne(query, update)
      res.send(result)
    })

    // decorator 
    app.patch('/booking/project/:id', verifyFriebaseToken, async (req, res) => {
      const { id } = req.params
      console.log(req.body)
      const status = req.body.status
      const query = { _id: new ObjectId(id) }
      const update = {
        $set: { serviceStatus: status }
      }
      const result = await bookingCollection.updateOne(query, update)
      res.send(result)
    })

    app.delete('/booking/:id', verifyFriebaseToken, async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await bookingCollection.deleteOne(query)
      res.send(result)
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

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
