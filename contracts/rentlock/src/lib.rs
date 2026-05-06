#![cfg_attr(not(feature = "std"), no_std, no_main)]

#[ink::contract]
mod rentlock {
    /// RentLock is an escrow contract for rental listings.
    /// State machine:
    /// Created → Funded → CheckedIn → Completed
    ///         ↘             ↘
    ///       Refunded      Disputed → Resolved

    #[derive(
        Debug,
        Clone,
        Copy,
        PartialEq,
        Eq,
        scale::Encode,
        scale::Decode,
        scale_info::TypeInfo,
        ink::storage::traits::StorageLayout
    )]
    pub enum ListingState {
        Created,
        Funded,
        CheckedIn,
        Completed,
        Refunded,
        Disputed,
        Resolved,
    }

    #[derive(
        Debug,
        PartialEq,
        Eq,
        scale::Encode,
        scale::Decode,
        scale_info::TypeInfo,
        ink::storage::traits::StorageLayout
    )]
    pub enum Error {
        InvalidState,
        Unauthorized,
        InsufficientFunds,
    }

    #[derive(
        Debug,
        Clone,
        Copy,
        scale::Encode,
        scale::Decode,
        PartialEq,
        Eq,
        scale_info::TypeInfo,
        ink::storage::traits::StorageLayout
    )]
    pub struct Listing {
        state: ListingState,
        landlord: AccountId,
        tenant: Option<AccountId>,
        price: Balance,
        arbiter: AccountId,
        deposit: Balance,
        resolved_to: Option<bool>, // true = to landlord, false = to tenant
    }

    #[ink(storage)]
    pub struct RentLock {
        next_listing_id: u32,
        listings: ink::storage::Mapping<u32, Listing>,
    }

    #[ink(event)]
    pub struct ListingCreated {
        #[ink(topic)]
        listing_id: u32,
        landlord: AccountId,
        price: Balance,
    }

    #[ink(event)]
    pub struct ListingFunded {
        #[ink(topic)]
        listing_id: u32,
        tenant: AccountId,
    }

    #[ink(event)]
    pub struct CheckinConfirmed {
        #[ink(topic)]
        listing_id: u32,
    }

    #[ink(event)]
    pub struct FundsReleased {
        #[ink(topic)]
        listing_id: u32,
        to: AccountId,
        amount: Balance,
    }

    impl RentLock {
        #[ink(constructor)]
        pub fn new() -> Self {
            Self {
                next_listing_id: 0,
                listings: ink::storage::Mapping::default(),
            }
        }

        #[ink(message)]
        pub fn create_listing(
            &mut self,
            landlord: AccountId,
            price: Balance,
            arbiter: AccountId,
        ) -> Result<u32, Error> {
            let listing_id = self.next_listing_id;
            self.next_listing_id = self.next_listing_id.saturating_add(1);

            let listing = Listing {
                state: ListingState::Created,
                landlord,
                tenant: None,
                price,
                arbiter,
                deposit: 0,
                resolved_to: None,
            };

            self.listings.insert(listing_id, &listing);
            self.env().emit_event(ListingCreated {
                listing_id,
                landlord,
                price,
            });

            Ok(listing_id)
        }

        #[ink(message, payable)]
        pub fn fund(&mut self, listing_id: u32) -> Result<(), Error> {
            let mut listing = self
                .listings
                .get(listing_id)
                .ok_or(Error::InvalidState)?;

            if listing.state != ListingState::Created {
                return Err(Error::InvalidState);
            }

            let amount = self.env().transferred_value();
            if amount < listing.price {
                return Err(Error::InsufficientFunds);
            }

            listing.state = ListingState::Funded;
            listing.tenant = Some(self.env().caller());
            listing.deposit = amount;

            self.listings.insert(listing_id, &listing);
            self.env().emit_event(ListingFunded {
                listing_id,
                tenant: self.env().caller(),
            });

            Ok(())
        }

        #[ink(message)]
        pub fn confirm_checkin(&mut self, listing_id: u32) -> Result<(), Error> {
            let mut listing = self
                .listings
                .get(listing_id)
                .ok_or(Error::InvalidState)?;

            if listing.state != ListingState::Funded {
                return Err(Error::InvalidState);
            }

            if self.env().caller() != listing.landlord {
                return Err(Error::Unauthorized);
            }

            listing.state = ListingState::CheckedIn;
            self.listings.insert(listing_id, &listing);
            self.env().emit_event(CheckinConfirmed { listing_id });

            Ok(())
        }

        #[ink(message)]
        pub fn release(&mut self, listing_id: u32) -> Result<(), Error> {
            let mut listing = self
                .listings
                .get(listing_id)
                .ok_or(Error::InvalidState)?;

            if listing.state != ListingState::CheckedIn {
                return Err(Error::InvalidState);
            }

            listing.state = ListingState::Completed;
            let amount = listing.deposit;
            let landlord = listing.landlord;

            self.listings.insert(listing_id, &listing);

            // Transfer funds to landlord
            if self.env().transfer(landlord, amount).is_err() {
                return Err(Error::InvalidState);
            }

            self.env().emit_event(FundsReleased {
                listing_id,
                to: landlord,
                amount,
            });

            Ok(())
        }

        #[ink(message)]
        pub fn dispute(&mut self, listing_id: u32) -> Result<(), Error> {
            let mut listing = self
                .listings
                .get(listing_id)
                .ok_or(Error::InvalidState)?;

            if listing.state != ListingState::Funded && listing.state != ListingState::CheckedIn
            {
                return Err(Error::InvalidState);
            }

            let caller = self.env().caller();
            if caller != listing.landlord
                && listing.tenant.map_or(true, |t| caller != t)
            {
                return Err(Error::Unauthorized);
            }

            listing.state = ListingState::Disputed;
            self.listings.insert(listing_id, &listing);

            Ok(())
        }

        #[ink(message)]
        pub fn resolve(&mut self, listing_id: u32, to_landlord: bool) -> Result<(), Error> {
            let mut listing = self
                .listings
                .get(listing_id)
                .ok_or(Error::InvalidState)?;

            if listing.state != ListingState::Disputed {
                return Err(Error::InvalidState);
            }

            if self.env().caller() != listing.arbiter {
                return Err(Error::Unauthorized);
            }

            listing.state = ListingState::Resolved;
            listing.resolved_to = Some(to_landlord);

            let amount = listing.deposit;
            let recipient = if to_landlord {
                listing.landlord
            } else {
                listing.tenant.ok_or(Error::InvalidState)?
            };

            self.listings.insert(listing_id, &listing);

            // Transfer funds to winner
            if self.env().transfer(recipient, amount).is_err() {
                return Err(Error::InvalidState);
            }

            self.env().emit_event(FundsReleased {
                listing_id,
                to: recipient,
                amount,
            });

            Ok(())
        }

        #[ink(message)]
        pub fn get_listing_state(&self, listing_id: u32) -> Result<ListingState, Error> {
            self.listings
                .get(listing_id)
                .map(|l| l.state)
                .ok_or(Error::InvalidState)
        }
    }
}
