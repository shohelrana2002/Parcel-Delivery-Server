const express = require("express");
const cors = require("cors");
const app = express();
const Stripe = require("stripe");
const admin = require("firebase-admin");
const port = process.env.PORT || 3000;
require("dotenv").config();

// middle were
app.use(cors());
app.use(express.json());

const serviceAccount = require("./firebase-secret-token.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

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
const usersCollections = client.db("Parcels").collection("Users");
const ridersCollections = client.db("Parcels").collection("Riders");
// middle were
const verifyFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "unauthorized" });
  }
  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).send({ message: "unauthorized" });
  }
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.decoded = decoded;
    next();
  } catch (error) {
    res.status(403).send({ message: "Forbidden access", error: error.message });
  }
};
const verifyAdmin = async (req, res, next) => {
  try {
    const email = req.decoded.email;
    const query = { email };
    const user = await usersCollections.findOne(query);

    if (!user || user.role !== "admin") {
      return res.status(403).send({ message: "Forbidden: Admins only" });
    }

    next();
  } catch (err) {
    res.status(500).send({ message: "Server error", error: err.message });
  }
};
const emailVerify = (req, res, next) => {
  const decodedEmail = req.decoded.email;
  const requestedEmail = req.query.email;
  if (!decodedEmail || decodedEmail !== requestedEmail) {
    return res.status(403).send({ message: "Forbidden: Email mismatch" });
  }
  next();
};
async function run() {
  try {
    app.get("/rider/parcels", async (req, res) => {
      const email = req.query.email;
      const query = {
        assigned_rider: email,
        delivery_status: { $in: ["assigned", "picked_up", "delivered"] },
      };

      const options = { sort: { creation_date: -1 } };
      const result = await parcelsCollections.find(query, options).toArray();

      console.log("📦 Found Parcels:", result.length);
      res.send(result);
    });
    app.get("/users", async (req, res) => {
      try {
        const { status } = req.query;
        const query = {};
        if (status) query.status = status;
        const riders = await ridersCollections.find(query).toArray();
        res.send(riders);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error", error: err.message });
      }
    });

    // user post route
    app.post("/users", async (req, res) => {
      const email = req.body.email;
      const existingUser = await usersCollections.findOne({ email });
      const now = new Date().toISOString();
      if (existingUser) {
        const updateRes = await usersCollections.updateOne(
          { email },
          { $set: { last_login_at: now } }
        );
        return res
          .status(200)
          .send({ message: "User exists, last_login_at updated", updateRes });
      }

      const user = req.body;
      const result = await usersCollections.insertOne(user);
      res.send(result);
    });
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

    app.get("/parcels", verifyFirebaseToken, async (req, res) => {
      try {
        const { payment_status, delivery_status, email } = req.query;
        const query = {};
        if (payment_status) query.payment_status = payment_status;
        if (delivery_status) query.delivery_status = delivery_status;
        if (email) query.created_by = email;

        const options = { sort: { creation_date: -1 } };

        const parcels = await parcelsCollections.find(query, options).toArray();
        res.send(parcels);
      } catch (error) {
        res.status(500).send({ message: "Server error", error: error.message });
      }
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
    // app.patch("/parcels/assign/:id", async (req, res) => {
    //   const id = req.params.id;
    //   const {
    //     assigned_rider,
    //     delivery_status,
    //     assigned_rider_id,
    //     assigned_rider_name,
    //   } = req.body;
    //   const result = await parcelsCollections.updateOne(
    //     { _id: new ObjectId(id) },
    //     {
    //       $set: {
    //         assigned_rider,
    //         delivery_status,
    //         assigned_rider_id,
    //         assigned_rider_name,
    //         assigned_date: new Date(),
    //       },
    //     }
    //   );

    //   res.send(result);
    // });
    app.patch("/parcels/assign/statusUpdate/:id", async (req, res) => {
      const id = req.params.id;
      const { delivery_status } = req.body;

      const updateDoc = {
        $set: {
          delivery_status,
          assigned_date: new Date().toISOString(),
        },
      };
      const result = await parcelsCollections.updateOne(
        { _id: new ObjectId(id) },
        updateDoc
      );
      res.send(result);
    });
    app.patch("/parcels/assign/:id", async (req, res) => {
      const id = req.params.id;
      const {
        assigned_rider,
        delivery_status,
        assigned_rider_id,
        assigned_rider_name,
      } = req.body;

      const updateDoc = {
        $set: {
          assigned_rider,
          delivery_status,
          assigned_rider_id,
          assigned_rider_name,
        },
      };

      const result = await parcelsCollections.updateOne(
        { _id: new ObjectId(id) },
        updateDoc
      );

      res.send(result);
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
        res.status(500).send({ error: error.message });
      }
    });
    // payments data get
    app.get("/payments", verifyFirebaseToken, emailVerify, async (req, res) => {
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
    // admin routes
    app.get(
      "/users/search",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        const email = req.query.email;
        if (!email) {
          res.status(401).send({ message: "Missing email query" });
        }
        const regex = new RegExp(email, "i");
        const users = await usersCollections
          .find({ email: { $regex: regex } })
          .limit(10)
          .toArray();
        res.send(users);
      }
    );

    app.patch(
      "/admin/update/role/:id",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const id = req.params.id;
          const { role, requesterEmail } = req.body;
          const targetUser = await usersCollections.findOne({
            _id: new ObjectId(id),
          });
          if (!targetUser) {
            return res.status(404).send({ message: "User not found" });
          }
          if (targetUser.email === requesterEmail.email) {
            return res
              .status(400)
              .send({ message: "You cannot change your own role" });
          }

          // Update the role
          const result = await usersCollections.updateOne(
            { _id: new ObjectId(id) },
            { $set: { role } }
          );

          res.send({
            success: true,
            message: `Role updated to ${role} successfully`,
            result,
          });
        } catch (err) {
          res.status(500).send({ message: "Server Error", error: err.message });
        }
      }
    );

    // app.patch("/admin/update/role/:id", async (req, res) => {
    //   const id = req.params.id;
    //   const { role } = req.body;
    //   const query = { _id: new ObjectId(id) };
    //   const updateDoc = {
    //     $set: {
    //       role,
    //     },
    //   };
    //   const result = await usersCollections.updateOne(query, updateDoc);

    //   res.send(result);
    // });
    // riders route
    app.get(
      "/riders/pending",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        const result = await ridersCollections
          .find({ status: "pending" })
          .toArray();
        res.send(result);
      }
    );
    app.get(
      "/riders/active",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        const result = await ridersCollections
          .find({ status: "active" })
          .toArray();
        res.send(result);
      }
    );
    app.patch(
      "/riders/:id",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const { status, email } = req.body;
        const query = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            status: status,
          },
        };
        if (status === "active" && email) {
          const queryRole = { email };
          const updatedRole = {
            $set: {
              role: "rider",
            },
          };
          await usersCollections.updateOne(queryRole, updatedRole);
        }
        const result = await ridersCollections.updateOne(query, updateDoc);
        res.send(result);
      }
    );
    app.delete(
      "/riders/:id",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await ridersCollections.deleteOne(query);
        res.send(result);
      }
    );
    // rider post
    app.post("/riders", async (req, res) => {
      const data = req.body;
      const email = data.email;
      const existingUser = await ridersCollections.findOne({ email });
      if (existingUser) {
        return res
          .status(400)
          .send({ message: "You have already applied!", applied: true });
      }
      const result = await ridersCollections.insertOne(data);
      res.send(result);
    });
    // get user
    app.get("/users/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const user = await usersCollections.findOne({ email });

        if (!user) {
          return res.status(404).send({ message: "User not found" });
        }

        res.send(user);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server Error", error: err.message });
      }
    });
    // test

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
