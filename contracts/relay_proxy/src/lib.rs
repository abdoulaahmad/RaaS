#![cfg_attr(not(feature = "std"), no_std, no_main)]

#[ink::contract]
mod relay_proxy {
    use ink::storage::Mapping;

    /// The relay_proxy contract is the core on-chain component.
    /// It is the only contract the relayer interacts with directly.
    /// Other contracts (like RentLock) are called by relay_proxy.

    #[derive(Debug, PartialEq, Eq, scale::Encode, scale::Decode)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
    pub enum Action {
        FundListing { listing_id: u32 },
        ConfirmCheckin { listing_id: u32 },
        ReleaseFunds { listing_id: u32 },
        Dispute { listing_id: u32 },
    }

    #[derive(Debug, PartialEq, Eq, scale::Encode, scale::Decode)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
    pub enum Error {
        Unauthorized,
        InvalidNonce,
        ActionFailed,
    }

    #[ink(storage)]
    pub struct RelayProxy {
        owner: AccountId,
        relayer: AccountId,
        nonces: Mapping<AccountId, u64>,
    }

    impl RelayProxy {
        #[ink(constructor)]
        pub fn new(relayer: AccountId) -> Self {
            Self {
                owner: Self::env().caller(),
                relayer,
                nonces: Mapping::default(),
            }
        }

        #[ink(message)]
        pub fn relay_action(
            &mut self,
            user: AccountId,
            nonce: u64,
            action: Action,
        ) -> Result<(), Error> {
            // Only trusted relayer may call
            if self.env().caller() != self.relayer {
                return Err(Error::Unauthorized);
            }

            // Validate nonce
            let current = self.nonces.get(user).unwrap_or(0);
            if nonce != current {
                return Err(Error::InvalidNonce);
            }

            // Increment nonce
            self.nonces.insert(user, &current.saturating_add(1));

            // Execute action
            self.execute(user, action)?;

            Ok(())
        }

        fn execute(&self, _user: AccountId, action: Action) -> Result<(), Error> {
            // In MVP: inline logic or cross-contract call to RentLock
            match action {
                Action::FundListing { listing_id: _ } => {
                    /* call rentlock */
                    Ok(())
                }
                Action::ConfirmCheckin { listing_id: _ } => Ok(()),
                Action::ReleaseFunds { listing_id: _ } => Ok(()),
                Action::Dispute { listing_id: _ } => Ok(()),
            }
        }

        #[ink(message)]
        pub fn get_nonce(&self, user: AccountId) -> u64 {
            self.nonces.get(user).unwrap_or(0)
        }

        #[ink(message)]
        pub fn update_relayer(&mut self, new_relayer: AccountId) -> Result<(), Error> {
            if self.env().caller() != self.owner {
                return Err(Error::Unauthorized);
            }
            self.relayer = new_relayer;
            Ok(())
        }
    }
}
