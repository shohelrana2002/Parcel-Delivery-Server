const express = require("express");
const cors = require("cors");
const app = express();
const Stripe = require("stripe");
const port = process.env.PORT || 3000;
require("dotenv").config();

// middle were
app.use(cors());
app.use(express.json());
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.6zoig.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
const parcelsCollections = client.db("Parcels").collection("SendParcels");
const paymentCollections = client.db("Parcels").collection("Payments");
const trackingCollections = client.db("Parcels").collection("Trackings");

async function run() {
  try {
    // parcel data start here
    // parcel post route
    app.post("/parcels", async (req, res) => {
      try {
        const data = req.body;
        const result = await parcelsCollections.insertOne(data);
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: "not found", error: err });
      }
    });
    // app.get("/parcels", async (req, res) => {
    //   const result = await parcelsCollections.find().toArray();
    //   res.send(result);
    // });

    // parcel get by email query
    app.get("/parcels", async (req, res) => {
      const email = req.query.email;
      // const query = email ? { created_by: email } : {};
      const query = { created_by: email };
      const option = {
        sort: {
          creation_date: -1,
        },
      };
      const result = await parcelsCollections.find(query, option).toArray();
      res.send(result);
    });
    // parcel delete by id params
    app.delete("/parcels/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await parcelsCollections.deleteOne(query);
        res.send(result);
      } catch (err) {
        res
          .status(500)
          .send({ message: "Failed to delete", error: err.message });
      }
    });
    // parcel payment page a get a single data
    app.get("/parcels/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await parcelsCollections.findOne(query);
      res.send(result);
    });
    // parcel payment
    app.post("/create-payment-intent", async (req, res) => {
      try {
        const { amount } = req.body;
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount * 100, // 10 USD হলে 1000 হবে
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: error.message });
      }
    });
    // payments data get
    app.get("/payments", async (req, res) => {
      const userEmail = req.query.email;
      const query = userEmail ? { email: userEmail } : {};
      const options = {
        sort: {
          paid_at_string: -1,
        },
      };
      const result = await paymentCollections.find(query, options).toArray();
      res.send(result);
    });
    // parcel payment data post
    app.post("/payments", async (req, res) => {
      try {
        const { parcelId, email, amount, paymentMethod, transitionId } =
          req.body;
        const updateResult = await parcelsCollections.updateOne(
          { _id: new ObjectId(parcelId) },
          { $set: { payment_status: "paid" } }
        );
        if (updateResult.modifiedCount === 0) {
          return res
            .status(500)
            .send({ message: "Parcel not found or already paid" });
        }

        const paymentDoc = {
          parcelId,
          email,
          paymentMethod,
          amount,
          transitionId,
          paid_at_string: new Date().toISOString(),
          paid_at: new Date(),
        };
        const paymentResult = await paymentCollections.insertOne(paymentDoc);
        res.send(paymentResult);
      } catch (error) {
        res
          .status(500)
          .send({ message: "cant found data", error: error.message });
      }
    });
    // parcel data end
    //  tracking post route
    app.post("/tracking", async (req, res) => {
      const {
        parcel_id,
        tracking_id,
        status,
        message,
        updated_by = "",
      } = req.body;
      const updatedDoc = {
        tracking_id,
        parcel_id: parcel_id ? new ObjectId(parcel_id) : undefined,
        status,
        message,
        time: new Date().toISOString(),
        updated_by,
      };
      const result = await trackingCollections.insertOne(updatedDoc);
      res.send(result);
    });
    // deploy to comment this
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", async (req, res) => {
  res.send("server is running");
});

app.listen(port, () => {
  console.log(` app listening on port ${port}`);
});
