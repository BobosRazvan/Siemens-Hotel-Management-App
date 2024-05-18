import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import crypto from "crypto";
import session from "express-session";

const app = express();
const port = 3000;

let checkInDate;
let checkOutDate;


const db = new pg.Client({
  user: "postgres",
  host: "localhost",
  database: "Hotel Management",
  password: "123456",
  port: 5432,
});
db.connect();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));


app.use(session({
  secret: 'partizan',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false },
}));



app.get("/", async function (req, res) {
  res.render("home.ejs");
  
});


function calculateDistance(lat1, lon1, lat2, lon2) {  //Haversine formula (it considers the Earth is flat)
  const R = 6371; 
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c; 
  return distance;
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}


app.get("/find-hotels", async function (req, res) {
  try {
    const radius = req.query.radius;
    console.log("Your coordinates:")
    console.log(req.query.latitude);
    console.log(req.query.longitude);
    console.log(req.query.checkInDate);
    console.log(req.query.checkOutDate);
    checkInDate=req.query.checkInDate;
    checkOutDate=req.query.checkOutDate;
    const result = await db.query(`SELECT * FROM hotel`);
    const allHotels = result.rows;

    const usersLongitude = req.query.longitude;
    const usersLatitude = req.query.latitude;
    const selectedHotels = [];

    allHotels.forEach(hotel => {
      if (calculateDistance(usersLatitude, usersLongitude, hotel.latitude, hotel.longitude) <= radius) {
        selectedHotels.push(hotel);
      }
    });

    //console.log(selectedHotels);

    res.render("hotels.ejs", { hotels: selectedHotels });
  } catch (error) {
    console.error("Error fetching hotels:", error);
    res.status(500).send("Internal Server Error");
  }
});
app.get("/select-hotel", async function (req, res) {
  try {
    const hotelId = req.query.hotelId;
    console.log(checkInDate);
    console.log(checkOutDate);
    
    
    const result = await db.query(`
      SELECT * FROM room 
      JOIN hotel ON hotel.id = room.hotel_id
      WHERE hotel.id = $1
      AND room.id NOT IN (
        SELECT room_id FROM reservations
        WHERE (
          (date_check_in <= $2 AND date_check_out >= $2) OR  
          (date_check_in <= $3 AND date_check_out  >= $3) OR  
          (date_check_in >= $2 AND date_check_out  <= $3)  
        )
      )
    `, [hotelId, checkInDate, checkOutDate]); 
    
    const availableRooms = result.rows;
    res.render("rooms.ejs",{ rooms: availableRooms });
  } catch (error) {
    console.error("Error fetching available rooms:", error);
    res.status(500).send("Internal Server Error");
  }
});



app.get("/make-reservation", async function (req, res) {
  try {
    const roomId = req.query.roomId;
    const hotelId = req.query.hotelId;

    const result = await db.query(`
      INSERT INTO reservations (hotel_id, room_id, date_check_in, date_check_out,hour_check_in)
      VALUES ($1, $2, $3, $4,'16:00')  
    `, [hotelId, roomId, checkInDate, checkOutDate]); //check-in by default 16:00 for ALL HOTELS

    res.render("reservationCompleted.ejs");
  } catch (error) {
    console.error("Error making reservation:", error);
    res.status(500).send("Internal Server Error");
  }
});


app.get("/see-reservations", async function (req, res) {
  try {
    const query = `
        SELECT
        reservations.*,
        hotel.name AS hotel_name,
        room.type AS room_type,
        room.price AS room_price
        FROM
        reservations
        JOIN
        hotel ON reservations.hotel_id = hotel.id
        JOIN
        room ON reservations.room_id = room.id;`;
  

    const result = await db.query(query);
    const allReservations = result.rows;
    
   
    
    res.render("reservations.ejs", { reservations: allReservations });
  } catch (error) {
    console.error("Error fetching reservations:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/cancel-reservation", async function (req, res){
  try {
    const reservationId = req.query.reservationId;
    const reservationCheckInDate = new Date(req.query.reservationCheckInDate);
    const reservationCheckOutDate = new Date(req.query.reservationCheckOutDate);
    const reservationCheckInHour = req.query.reservationCheckInHour;
    const currentDate = new Date();
    const currentTime = currentDate.getHours();
    const checkInHour = parseInt(reservationCheckInHour.split(':')[0]); 
    console.log("Current Time:", currentTime);
    console.log("Reservation Check In Hour:", checkInHour);
    console.log("Current Date:", currentDate);
    console.log("Reservation Check In Date:", reservationCheckInDate);

     if(currentDate < reservationCheckInDate){
        console.log("Cancellation allowed.");
        const deleteQuery = `
              DELETE FROM reservations
              WHERE id = $1;
          `;
          await db.query(deleteQuery, [reservationId]);
          res.render("cancellationAllowed.ejs");
     }
     else if (currentDate == reservationCheckInDate) {
      
          if ((checkInHour - currentTime) >= 2) {
            console.log("Cancellation allowed.");
            const deleteQuery = `
              DELETE FROM reservations
              WHERE id = $1;
          `;
          await db.query(deleteQuery, [reservationId]);
          res.render("cancellationAllowed.ejs");
          } else {
            console.log("Cancellation not allowed. Less than 2 hours remaining.");
            res.render("cancellationNotAllowed.ejs");
          }
    } else {
      console.log("Cancellation not allowed. Check-in date has already passed.");
      res.render("cancellationNotAllowed.ejs");
    }

   
  } catch (error) {
    console.error("Error canceling reservation:", error);
    res.status(500).send("Internal Server Error");
  }
});



app.get("/review", async function (req, res){

   const hotelId=req.query.hotelId;

   res.render("review.ejs",{hotelId: hotelId});
});



app.get("/submit-review", async function (req, res){
  try {
      const reviewDescription = req.query.reviewDescription;
      const reviewGrade = req.query.reviewGrade;
      const hotelId=req.query.hotelId;
      
      const insertQuery = `
          INSERT INTO review (hotel_id,description, grade)
          VALUES ($1, $2, $3)
      `;
      
      await db.query(insertQuery, [hotelId,reviewDescription, reviewGrade]);

     
      res.render("submittedReview.ejs");
  } catch (error) {
      console.error("Error submitting review:", error);
      res.status(500).send("Internal Server Error");
  }
});
app.get("/allReviews", async function (req, res){
  try {
      
      const hotelId=req.query.hotelId;
      
      const selectQuery = `
          SELECT * FROM review WHERE hotel_id=$1`;
      
      const result=await db.query(selectQuery, [hotelId]);
      const allReviews=result.rows;
      

     
      res.render("allReviews.ejs",{reviews: allReviews});
  } catch (error) {
      console.error("Error submitting review:", error);
      res.status(500).send("Internal Server Error");
  }
});



app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});