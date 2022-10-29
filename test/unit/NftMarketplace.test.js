const { assert, expect } = require("chai")
const { network, deployments, ethers, getNamedAccounts } = require("hardhat")
const { developmentChains } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Nft Marketplace Tests", function () {
          let nftMarketplace, basicNft, player, deployer
          const TOKEN_ID = 0
          const PRICE = ethers.utils.parseEther("0.1")
          beforeEach(async function () {
              //player = (await getNamedAccounts()).player
              accounts = await ethers.getSigners()
              deployer = accounts[0]
              player = accounts[1]
              await deployments.fixture(["all"])
              nftMarketplace = await ethers.getContract("NftMarketPlace")
              // nftMarketplace = await nftMarketplace.connect(player)
              basicNft = await ethers.getContract("BasicNft")
              await basicNft.mintNft()
              await basicNft.approve(nftMarketplace.address, TOKEN_ID)
          })

          describe("listItem", function () {
              it("emits an event after listing an item", async function () {
                  expect(await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)).to.emit(
                      "ItemListed"
                  )
              })
              it("exclusively items that haven't been listed", async function () {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  const error = `AlreadyListed("${basicNft.address}", ${TOKEN_ID})`
                  //   await expect(
                  //       nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  //   ).to.be.revertedWith("AlreadyListed")
                  await expect(
                      nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  ).to.be.revertedWith(error)
              })
              it("exclusively allows owners to list", async function () {
                  nftMarketplace = nftMarketplace.connect(player)
                  await basicNft.approve(player.address, TOKEN_ID)
                  await expect(
                      nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  ).to.be.revertedWith("NotOwner")
              })
              it("needs approvals to list item", async function () {
                  await basicNft.approve(ethers.constants.AddressZero, TOKEN_ID)
                  await expect(
                      nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  ).to.be.revertedWith("NotApprovedForMarketplace")
              })
              it("Updates listing with seller and price", async function () {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  const listing = await nftMarketplace.getListing(basicNft.address, TOKEN_ID)
                  assert(listing.price.toString() == PRICE.toString())
                  assert(listing.seller.toString() == deployer.address)
              })
          })
          describe("cancelListing", function () {
              it("reverts if there is no listing", async function () {
                  const error = `NotListed("${basicNft.address}", ${TOKEN_ID})`
                  await expect(
                      nftMarketplace.cancelListing(basicNft.address, TOKEN_ID)
                  ).to.be.revertedWith(error)
              })
              it("reverts if anyone but the owner tries to call", async function () {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  nftMarketplace = nftMarketplace.connect(player)
                  await basicNft.approve(player.address, TOKEN_ID)
                  await expect(
                      nftMarketplace.cancelListing(basicNft.address, TOKEN_ID)
                  ).to.be.revertedWith("NotOwner")
              })
              it("emits event and removes listing", async function () {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  expect(await nftMarketplace.cancelListing(basicNft.address, TOKEN_ID)).to.emit(
                      "ItemCanceled"
                  )
                  const listing = await nftMarketplace.getListing(basicNft.address, TOKEN_ID)
                  assert(listing.price.toString() == "0")
              })
          })
          describe("updateListing", function () {
              it("must be owner and listed", async function () {
                  await expect(
                      nftMarketplace.updateListing(basicNft.address, TOKEN_ID, PRICE)
                  ).to.be.revertedWith("NotListed")
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  nftMarketplace = nftMarketplace.connect(player)
                  await expect(
                      nftMarketplace.updateListing(basicNft.address, TOKEN_ID, PRICE)
                  ).to.be.revertedWith("NotOwner")
              })
              it("updates the price of the item", async function () {
                  const updatedPrice = ethers.utils.parseEther("0.2")
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  expect(
                      await nftMarketplace.updateListing(basicNft.address, TOKEN_ID, updatedPrice)
                  ).to.emit("ItemListed")
                  const listing = await nftMarketplace.getListing(basicNft.address, TOKEN_ID)
                  assert(listing.price.toString() == updatedPrice.toString())
              })
          })
          describe("withdrawProceeds", function () {
              it("doesn't allow 0 proceed withdrawls", async function () {
                  await expect(nftMarketplace.withdrawProceeds()).to.be.revertedWith("NoProceeds")
              })
              it("withdraws proceeds", async function () {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  nftMarketplace = nftMarketplace.connect(player)
                  await nftMarketplace.buyItem(basicNft.address, TOKEN_ID, { value: PRICE })
                  nftMarketplace = nftMarketplace.connect(deployer)

                  const deployerProceedsBefore = await nftMarketplace.getProceeds(deployer.address)
                  const deployerBalanceBefore = await deployer.getBalance()
                  const txResponse = await nftMarketplace.withdrawProceeds()
                  const transactionReceipt = await txResponse.wait(1)
                  const { gasUsed, effectiveGasPrice } = transactionReceipt
                  const gasCost = gasUsed.mul(effectiveGasPrice)
                  const deployerBalanceAfter = await deployer.getBalance()

                  assert(
                      deployerBalanceAfter.add(gasCost).toString() ==
                          deployerProceedsBefore.add(deployerBalanceBefore).toString()
                  )
              })
          })
      })
